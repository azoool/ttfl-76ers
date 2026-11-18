import { malusFromBox, playerKey, ttflScore } from './ttfl'

/** Moyenne TTFL d'un joueur sur la saison régulière. */
export interface SeasonStat {
  /** identifiant ESPN du joueur */
  id: string
  name: string
  /** matchs joués */
  gp: number
  /** score TTFL moyen par match joué */
  avg: number
}

export interface SeasonStats {
  /** ex. « 2026-27 » */
  season: string
  players: SeasonStat[]
}

interface RawCategoryDef {
  name: string
  names: string[]
}

interface RawAthlete {
  athlete: { id: string; displayName: string }
  categories: Array<{ name: string; values: number[] }>
}

/** Réponse de `statistics/byathlete` (ESPN) : seuls les champs utilisés sont décrits. */
export interface RawSeasonStats {
  requestedSeason?: { displayName?: string }
  currentSeason?: { displayName?: string }
  categories?: RawCategoryDef[]
  athletes?: RawAthlete[]
}

// Les totaux de la saison (et non les moyennes affichées, arrondies à 0,1) servent à calculer la
// moyenne TTFL : (somme des points TTFL de tous les matchs) / (matchs joués).
const NEEDED: Record<string, string[]> = {
  general: ['gamesPlayed', 'rebounds'],
  offensive: [
    'points',
    'fieldGoalsMade',
    'fieldGoalsAttempted',
    'threePointFieldGoalsMade',
    'threePointFieldGoalsAttempted',
    'freeThrowsMade',
    'freeThrowsAttempted',
    'assists',
    'turnovers',
  ],
  defensive: ['steals', 'blocks'],
}

/**
 * Moyenne TTFL de chaque joueur à partir des totaux de la saison fournis par ESPN.
 * Lève une erreur si ESPN change le format, plutôt que d'afficher des moyennes fausses.
 */
export function parseSeasonStats(raw: RawSeasonStats): SeasonStats {
  const defs = new Map((raw.categories ?? []).map((c) => [c.name, c.names]))
  const pos: Record<string, Record<string, number>> = {}
  for (const [cat, stats] of Object.entries(NEEDED)) {
    pos[cat] = {}
    for (const s of stats) {
      const i = defs.get(cat)?.indexOf(s) ?? -1
      if (i < 0) throw new Error(`Format des statistiques ESPN inattendu (« ${cat}.${s} » introuvable).`)
      pos[cat][s] = i
    }
  }

  const players: SeasonStat[] = []
  for (const a of raw.athletes ?? []) {
    const values = new Map(a.categories.map((c) => [c.name, c.values]))
    const v = (cat: string, stat: string) => Number(values.get(cat)?.[pos[cat][stat]] ?? 0)
    const gp = v('general', 'gamesPlayed')
    if (!(gp > 0)) continue // pas encore de match cette saison : pas de moyenne
    const total = ttflScore({
      pts: v('offensive', 'points'),
      reb: v('general', 'rebounds'),
      ast: v('offensive', 'assists'),
      stl: v('defensive', 'steals'),
      blk: v('defensive', 'blocks'),
      ftm: v('offensive', 'freeThrowsMade'),
      fgm: v('offensive', 'fieldGoalsMade'),
      fg3m: v('offensive', 'threePointFieldGoalsMade'),
      malus: malusFromBox({
        tov: v('offensive', 'turnovers'),
        fgm: v('offensive', 'fieldGoalsMade'),
        fga: v('offensive', 'fieldGoalsAttempted'),
        fg3m: v('offensive', 'threePointFieldGoalsMade'),
        fg3a: v('offensive', 'threePointFieldGoalsAttempted'),
        ftm: v('offensive', 'freeThrowsMade'),
        fta: v('offensive', 'freeThrowsAttempted'),
      }),
    })
    players.push({ id: String(a.athlete.id), name: a.athlete.displayName, gp, avg: Math.round((total / gp) * 100) / 100 })
  }

  const season = raw.requestedSeason?.displayName ?? raw.currentSeason?.displayName ?? ''
  return { season, players }
}

/** Recherche d'un joueur : par identifiant ESPN d'abord, sinon par nom (accents et suffixes ignorés). */
export interface StatsIndex {
  season: string
  find(id: string | undefined, name: string): SeasonStat | undefined
}

export function indexStats(stats: SeasonStats): StatsIndex {
  const byId = new Map<string, SeasonStat>()
  const byName = new Map<string, SeasonStat>()
  for (const p of stats.players) {
    byId.set(p.id, p)
    byName.set(playerKey(p.name), p)
  }
  return {
    season: stats.season,
    find: (id, name) => (id ? byId.get(id) : undefined) ?? byName.get(playerKey(name)),
  }
}
