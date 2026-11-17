import type { Candidate } from './availability'

// API publique (non officielle) d'ESPN : renvoie `Access-Control-Allow-Origin: *`,
// donc le navigateur du téléphone peut l'appeler directement, sans serveur intermédiaire.
const BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba'

export interface TeamRef {
  id: string
  abbr: string
  name: string
}

export interface Game {
  id: string
  startUtc: string
  home: TeamRef
  away: TeamRef
  state: 'pre' | 'in' | 'post'
}

interface ScoreboardResponse {
  events?: Array<{
    id: string
    date: string
    competitions: Array<{
      competitors: Array<{
        homeAway: 'home' | 'away'
        team: { id: string; abbreviation: string; displayName: string }
      }>
    }>
    status: { type: { state: 'pre' | 'in' | 'post' } }
  }>
}

interface RosterResponse {
  team?: { id: string; abbreviation: string }
  athletes?: Array<{
    id: string
    fullName: string
    position?: { abbreviation?: string }
    injuries?: Array<{ status?: string; shortComment?: string }>
  }>
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`ESPN a répondu ${res.status}`)
  return (await res.json()) as T
}

/** Petit cache localStorage (les effectifs changent rarement ; le calendrier un peu plus). */
async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const k = `ttfl76.cache.${key}`
  try {
    const raw = localStorage.getItem(k)
    if (raw) {
      const { at, value } = JSON.parse(raw) as { at: number; value: T }
      if (Date.now() - at < ttlMs) return value
    }
  } catch {
    // stockage indisponible : on charge sans cache
  }
  const value = await load()
  try {
    localStorage.setItem(k, JSON.stringify({ at: Date.now(), value }))
  } catch {
    // quota dépassé ou mode privé : tant pis
  }
  return value
}

/** Matchs d'un jour NBA (date au format YYYY-MM-DD). */
export function fetchGames(date: string): Promise<Game[]> {
  return cached(`games.${date}`, 15 * 60_000, async () => {
    const data = await getJson<ScoreboardResponse>(`${BASE}/scoreboard?dates=${date.replaceAll('-', '')}`)
    return (data.events ?? []).map((e) => {
      const comp = e.competitions[0]
      const ref = (side: 'home' | 'away'): TeamRef => {
        const c = comp.competitors.find((x) => x.homeAway === side)!
        return { id: c.team.id, abbr: c.team.abbreviation, name: c.team.displayName }
      }
      return { id: e.id, startUtc: e.date, home: ref('home'), away: ref('away'), state: e.status.type.state }
    })
  })
}

/** Effectif d'une équipe, avec le statut de blessure de chaque joueur. */
export function fetchRoster(team: TeamRef): Promise<Candidate[]> {
  return cached(`roster.${team.id}`, 3 * 3_600_000, async () => {
    const data = await getJson<RosterResponse>(`${BASE}/teams/${team.id}/roster`)
    return (data.athletes ?? []).map((a): Candidate => {
      const inj = a.injuries?.[0]
      return {
        name: a.fullName,
        team: team.abbr,
        teamId: team.id,
        position: a.position?.abbreviation,
        injury: inj?.status ? { status: inj.status, comment: inj.shortComment } : undefined,
      }
    })
  })
}

export interface Night {
  games: Game[]
  candidates: Candidate[]
}

/** Matchs du jour + joueurs des équipes qui jouent. */
export async function fetchNight(date: string): Promise<Night> {
  const games = await fetchGames(date)
  const teams = new Map<string, TeamRef>()
  for (const g of games) {
    teams.set(g.home.id, g.home)
    teams.set(g.away.id, g.away)
  }
  const rosters = await Promise.all([...teams.values()].map(fetchRoster))
  return { games, candidates: rosters.flat() }
}
