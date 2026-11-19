import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { addDays } from './dates'
import { SUPABASE_KEY, SUPABASE_URL, syncConfigured } from './supabaseConfig'
import { buildMembers, type MemberRow, type PickRow, type SyncMember } from './team'

/** Équipe rejointe sur cet appareil. */
export interface TeamLink {
  teamId: string
  teamName: string
  memberId: string
  inviteCode: string
}

export interface TeamData {
  teamName: string
  inviteCode: string
  members: SyncMember[]
}

export interface PushPick {
  date: string
  player: string
  score?: number
  x2?: boolean
}

export class SyncError extends Error {
  constructor(
    message: string,
    readonly kind: 'config' | 'not-member' | 'other' = 'other',
  ) {
    super(message)
  }
}

/** Seuls les 45 derniers jours comptent pour le verrou de 30 jours. */
const WINDOW_DAYS = 45
const CHUNK = 500

// ── Mémoire locale : équipe rejointe + dernier état connu (affichage hors connexion) ──
const LINK_KEY = 'ttfl76.team.v1'
const CACHE_KEY = 'ttfl76.team.cache.v1'

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}
function writeJson(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // stockage indisponible : l'appli reste utilisable, sans mémoire entre deux ouvertures
  }
}
export const loadTeamLink = () => readJson<TeamLink>(LINK_KEY)
export const saveTeamLink = (l: TeamLink | null) => writeJson(LINK_KEY, l)
export const loadTeamCache = () => readJson<TeamData>(CACHE_KEY)
export const saveTeamCache = (d: TeamData | null) => writeJson(CACHE_KEY, d)

// ── Connexion ──
let client: SupabaseClient | null = null
let session: Promise<void> | null = null

function getClient(): SupabaseClient {
  if (!syncConfigured) throw new SyncError('La synchronisation d’équipe n’est pas configurée.', 'config')
  client ??= createClient(SUPABASE_URL!, SUPABASE_KEY!, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'ttfl76.auth' },
  })
  return client
}

/** Connexion anonyme : aucun compte ni mot de passe, l'appareil reçoit une identité locale. */
async function ready(): Promise<SupabaseClient> {
  const sb = getClient()
  session ??= (async () => {
    const { data } = await sb.auth.getSession()
    if (data.session) return
    const { error } = await sb.auth.signInAnonymously()
    if (error) throw error
  })().catch((e) => {
    session = null // permet de réessayer
    throw e
  })
  await session
  return sb
}

// ── Opérations ──
interface CreatedRow {
  out_team_id: string
  out_invite_code: string
  out_member_id: string
}
interface JoinedRow {
  out_team_id: string
  out_team_name: string
  out_invite_code: string
  out_member_id: string
}

export async function createTeam(teamName: string, myName: string): Promise<TeamLink> {
  const sb = await ready()
  const { data, error } = await sb.rpc('create_team', { p_team_name: teamName, p_my_name: myName })
  if (error) throw error
  const r = (data as CreatedRow[])[0]
  return { teamId: r.out_team_id, teamName: teamName.trim(), memberId: r.out_member_id, inviteCode: r.out_invite_code }
}

export async function joinTeam(code: string, myName: string): Promise<TeamLink> {
  const sb = await ready()
  const { data, error } = await sb.rpc('join_team', { p_code: code, p_my_name: myName })
  if (error) throw error
  const r = (data as JoinedRow[])[0]
  return { teamId: r.out_team_id, teamName: r.out_team_name, memberId: r.out_member_id, inviteCode: r.out_invite_code }
}

/** Équipe vue depuis son code d'invitation, avant de la rejoindre : son nom et ses membres (pseudos seulement). */
export interface TeamPreview {
  teamName: string
  members: { name: string; claimed: boolean }[]
}

interface PreviewRow {
  team_name: string
  members: { name: string; claimed: boolean }[]
}

export async function previewTeam(code: string): Promise<TeamPreview> {
  const sb = await ready()
  const { data, error } = await sb.rpc('preview_team', { p_code: code })
  if (error) throw error
  const r = data as PreviewRow
  return { teamName: r.team_name, members: r.members ?? [] }
}

export async function fetchTeam(link: TeamLink, today: string): Promise<TeamData> {
  const sb = await ready()

  const team = await sb.from('teams').select('name, invite_code').eq('id', link.teamId).maybeSingle()
  if (team.error) throw team.error
  if (!team.data) throw new SyncError('Tu ne fais plus partie de cette équipe.', 'not-member')

  const members = await sb.from('members').select('id, name, user_id').eq('team_id', link.teamId)
  if (members.error) throw members.error
  const rows = members.data as MemberRow[]

  let picks: PickRow[] = []
  if (rows.length > 0) {
    const res = await sb
      .from('picks')
      .select('member_id, date, player, updated_at')
      .in('member_id', rows.map((m) => m.id))
      .gte('date', addDays(today, -WINDOW_DAYS))
      .order('date', { ascending: false })
      .limit(1000)
    if (res.error) throw res.error
    picks = res.data as PickRow[]
  }

  return {
    teamName: team.data.name as string,
    inviteCode: team.data.invite_code as string,
    members: buildMembers(rows, picks, link.memberId),
  }
}

/**
 * Enregistre des picks pour un membre de l'équipe, identifié par son pseudo (insensible à la casse).
 * `add_member` retrouve le membre s'il existe déjà (y compris soi-même) et le crée sinon.
 */
export async function pushPicks(link: TeamLink, memberName: string, picks: PushPick[]): Promise<void> {
  const sb = await ready()
  const added = await sb.rpc('add_member', { p_team: link.teamId, p_name: memberName })
  if (added.error) throw added.error
  const memberId = added.data as string
  const rows = picks.map((p) => ({
    member_id: memberId,
    date: p.date,
    player: p.player,
    score: p.score ?? null,
    x2: p.x2 ?? false,
    source: 'import',
  }))
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await sb.from('picks').upsert(rows.slice(i, i + CHUNK), { onConflict: 'member_id,date' })
    if (error) throw error
  }
}

export async function leaveTeam(link: TeamLink, deleteData: boolean): Promise<void> {
  const sb = await ready()
  const { error } = await sb.rpc('leave_team', { p_team: link.teamId, p_delete: deleteData })
  if (error) throw error
}

export async function rotateInviteCode(link: TeamLink): Promise<string> {
  const sb = await ready()
  const { data, error } = await sb.rpc('rotate_invite_code', { p_team: link.teamId })
  if (error) throw error
  return data as string
}
