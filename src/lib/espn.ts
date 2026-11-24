import type { Candidate } from './availability'
import { parseGameLog, type GameLine, type RawGameLog } from './form'
import { parseSeasonStats, type RawSeasonStats, type SeasonStats } from './seasonStats'

// API publique (non officielle) d'ESPN : renvoie `Access-Control-Allow-Origin: *`,
// donc le navigateur du téléphone peut l'appeler directement, sans serveur intermédiaire.
const BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba'
// Statistiques de saison de tous les joueurs en une seule requête (≈ 300 Ko compressés).
const SEASON_STATS = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/statistics/byathlete'

export interface TeamRef {
  id: string
  abbr: string
  /** nom complet, ex. « Philadelphia 76ers » */
  name: string
  logo?: string
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
        team: { id: string; abbreviation: string; displayName: string; logo?: string }
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
  return cached(`games2.${date}`, 15 * 60_000, async () => {
    const data = await getJson<ScoreboardResponse>(`${BASE}/scoreboard?dates=${date.replaceAll('-', '')}`)
    return (data.events ?? []).map((e) => {
      const comp = e.competitions[0]
      const ref = (side: 'home' | 'away'): TeamRef => {
        const c = comp.competitors.find((x) => x.homeAway === side)!
        return { id: c.team.id, abbr: c.team.abbreviation, name: c.team.displayName, logo: c.team.logo }
      }
      return { id: e.id, startUtc: e.date, home: ref('home'), away: ref('away'), state: e.status.type.state }
    })
  })
}

/** Effectif d'une équipe, avec le statut de blessure de chaque joueur. */
export function fetchRoster(team: TeamRef): Promise<Candidate[]> {
  return cached(`roster2.${team.id}`, 3 * 3_600_000, async () => {
    const data = await getJson<RosterResponse>(`${BASE}/teams/${team.id}/roster`)
    return (data.athletes ?? []).map((a): Candidate => {
      const inj = a.injuries?.[0]
      return {
        id: a.id,
        name: a.fullName,
        team: team.abbr,
        teamId: team.id,
        position: a.position?.abbreviation,
        injury: inj?.status ? { status: inj.status, comment: inj.shortComment } : undefined,
      }
    })
  })
}

/**
 * Moyenne TTFL de la saison régulière en cours pour chaque joueur (mise en cache 2 h : les stats
 * ne bougent qu'après les matchs). Seul le résultat compact est gardé, pas la réponse d'ESPN (6 Mo).
 */
export function fetchSeasonStats(): Promise<SeasonStats> {
  return cached('seasonstats2', 2 * 3_600_000, async () => {
    const params = 'region=us&lang=en&contentorigin=espn&isqualified=false&limit=500&page=1&sort=offensive.avgPoints%3Adesc'
    return parseSeasonStats(await getJson<RawSeasonStats>(`${SEASON_STATS}?${params}`))
  })
}

/**
 * Les 10 derniers matchs joués d'un joueur (saison régulière), du plus récent au plus ancien, avec leur score TTFL.
 * Une requête d'environ 8 Ko, faite au premier clic sur la moyenne ; mise en cache 2 h.
 */
export function fetchRecentGames(athleteId: string): Promise<GameLine[]> {
  return cached(`gamelog1.${athleteId}`, 2 * 3_600_000, async () => {
    const url = `https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${encodeURIComponent(athleteId)}/gamelog?region=us&lang=en&contentorigin=espn`
    return parseGameLog(await getJson<RawGameLog>(url)).slice(0, 10)
  })
}

/** Supprime les entrées de cache d'avant l'ajout des logos et des identifiants de joueurs. */
function purgeLegacyCache(): void {
  try {
    const stale: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && /^ttfl76\.cache\.(games\.|roster\.)/.test(k)) stale.push(k)
    }
    stale.forEach((k) => localStorage.removeItem(k))
  } catch {
    // stockage indisponible : rien à nettoyer
  }
}

export interface Night {
  games: Game[]
  /** équipes qui jouent ce jour-là (nom complet et logo compris) */
  teams: TeamRef[]
  candidates: Candidate[]
}

/** Matchs du jour + joueurs des équipes qui jouent. */
export async function fetchNight(date: string): Promise<Night> {
  purgeLegacyCache()
  const games = await fetchGames(date)
  const teams = new Map<string, TeamRef>()
  for (const g of games) {
    teams.set(g.home.id, g.home)
    teams.set(g.away.id, g.away)
  }
  const list = [...teams.values()]
  const rosters = await Promise.all(list.map(fetchRoster))
  return { games, teams: list, candidates: rosters.flat() }
}
