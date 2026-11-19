// Logique d'équipe sans accès réseau (donc testable) : navigation par lien d'invitation,
// assemblage des membres reçus du serveur, messages d'erreur lisibles.
import type { Member } from './availability'

export type Tab = 'dispos' | 'import' | 'equipe' | 'installer'
export const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'dispos', label: 'Disponibles', icon: '🏀' },
  { id: 'import', label: 'Importer', icon: '📋' },
  { id: 'equipe', label: 'Équipe', icon: '👥' },
  { id: 'installer', label: 'Installer', icon: '📲' },
]

export interface Route {
  tab: Tab
  /** Code lu dans un lien d'invitation (#/join/CODE), en majuscules. */
  joinCode?: string
}

/** `#/dispos`, `#/equipe`… ou `#/join/ABCD2345` (lien d'invitation → onglet Équipe, code prérempli). */
export function parseRoute(hash: string): Route {
  const h = hash.replace(/^#\/?/, '')
  const join = /^join\/([A-Za-z0-9]{1,16})\/?$/.exec(h)
  if (join) return { tab: 'equipe', joinCode: join[1].toUpperCase() }
  return { tab: TABS.some((t) => t.id === h) ? (h as Tab) : 'dispos' }
}

/** Lien à partager pour inviter quelqu'un : l'adresse de l'appli + le code. */
export function inviteUrl(base: string, code: string): string {
  return `${base.replace(/#.*$/, '')}#/join/${code}`
}

/** Un code saisi à la main : majuscules, sans espaces ni tirets. */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export interface MemberRow {
  id: string
  name: string
  user_id: string | null
}
export interface PickRow {
  member_id: string
  date: string
  player: string
  updated_at?: string
}

/** Membre d'équipe tel qu'affiché : un `Member` (pour le calcul) + son statut. */
export interface SyncMember extends Member {
  /** Quelqu'un a rejoint l'équipe avec ce pseudo (sinon : ajouté par un coéquipier). */
  claimed: boolean
  /** C'est moi. */
  me: boolean
}

export function buildMembers(members: MemberRow[], picks: PickRow[], myMemberId: string): SyncMember[] {
  const byMember = new Map<string, PickRow[]>()
  for (const p of picks) {
    const list = byMember.get(p.member_id)
    if (list) list.push(p)
    else byMember.set(p.member_id, [p])
  }
  return members
    .map((m): SyncMember => {
      const mine = (byMember.get(m.id) ?? []).sort((a, b) => (a.date < b.date ? 1 : -1))
      const updated = mine.map((p) => p.updated_at).filter((d): d is string => !!d).sort().pop()
      return {
        id: m.id,
        name: m.name,
        picks: mine.map((p) => ({ date: p.date, player: p.player })),
        updatedAt: updated,
        claimed: m.user_id !== null,
        me: m.id === myMemberId,
      }
    })
    .sort((a, b) => Number(b.me) - Number(a.me) || a.name.localeCompare(b.name, 'fr'))
}

/** Limites imposées par la base (voir supabase/schema.sql). */
export const MAX_MEMBERS = 12
export const MAX_NAME = 40

/**
 * Pseudos saisis en vrac (un par ligne, ou séparés par des virgules ou des points-virgules) :
 * nettoyés, sans doublon (la casse est ignorée), dans l'ordre de saisie.
 */
export function parseNames(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of text.split(/[\n\r,;]+/)) {
    const name = raw.trim().replace(/\s+/g, ' ')
    const key = name.toLowerCase()
    if (!name || seen.has(key)) continue
    seen.add(key)
    out.push(name)
  }
  return out
}

/** Noms des membres à proposer dans la liste « Qui es-tu ? » : d'abord ceux pas encore inscrits, puis ceux déjà liés à un appareil. */
export function splitPreviewMembers(members: { name: string; claimed: boolean }[]): { fresh: string[]; claimed: string[] } {
  const names = (claimed: boolean) =>
    members
      .filter((m) => m.claimed === claimed)
      .map((m) => m.name)
      .sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }))
  return { fresh: names(false), claimed: names(true) }
}

/**
 * Pourquoi l'aperçu d'une équipe a échoué :
 * - `unknown-code` : le code n'existe pas (ou plus) ;
 * - `unavailable` : la fonction d'aperçu n'est pas (encore) installée dans Supabase → on saisit son pseudo à la main ;
 * - `other` : réseau, serveur… → on saisit son pseudo à la main, en prévenant.
 */
export function classifyPreviewError(e: unknown): 'unknown-code' | 'unavailable' | 'other' {
  const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : ''
  const msg = errorText(e)
  if (code === 'P0002' || /code d'invitation inconnu/i.test(msg)) return 'unknown-code'
  if (code === 'PGRST202' || /could not find the function|preview_team/i.test(msg)) return 'unavailable'
  return 'other'
}

function errorText(e: unknown): string {
  return e instanceof Error
    ? e.message
    : typeof e === 'object' && e !== null && 'message' in e
      ? String((e as { message: unknown }).message)
      : String(e)
}

/** Transforme une erreur réseau / Supabase en phrase compréhensible par un joueur. */
export function friendlyError(e: unknown): string {
  const msg = errorText(e)
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) {
    return 'Pas de connexion à Internet. Réessaie dans un instant.'
  }
  if (/anonymous sign-ins are disabled/i.test(msg)) {
    return 'Les connexions anonymes ne sont pas activées dans Supabase (Authentication → Sign In / Providers).'
  }
  if (/invalid api key|apikey/i.test(msg)) {
    return 'La clé Supabase de l’appli est invalide.'
  }
  return msg
}
