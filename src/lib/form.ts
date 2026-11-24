import { malusFromBox, ttflScore } from './ttfl'

/** Score TTFL d'un match joué. */
export interface GameLine {
  /** date du match (ISO) */
  date: string
  ttfl: number
}

/** Ce qu'on lit de la réponse `athletes/{id}/gamelog` d'ESPN. */
export interface RawGameLog {
  names?: string[]
  events?: Record<string, { gameDate?: string }>
  seasonTypes?: Array<{
    displayName?: string
    categories?: Array<{ events?: Array<{ eventId: string; stats: string[] }> }>
  }>
}

const NEEDED = [
  'minutes',
  'fieldGoalsMade-fieldGoalsAttempted',
  'threePointFieldGoalsMade-threePointFieldGoalsAttempted',
  'freeThrowsMade-freeThrowsAttempted',
  'totalRebounds',
  'assists',
  'blocks',
  'steals',
  'turnovers',
  'points',
]

const made = (s: string): [number, number] | undefined => {
  const m = /^(\d+)-(\d+)$/.exec(s)
  return m ? [Number(m[1]), Number(m[2])] : undefined
}

/**
 * Matchs de saison régulière joués par un joueur, du plus récent au plus ancien, avec leur score TTFL.
 * Les matchs sans statistiques (absent, non utilisé) sont ignorés. Lève une erreur si ESPN change le format.
 */
export function parseGameLog(raw: RawGameLog): GameLine[] {
  const names = raw.names ?? []
  const pos: Record<string, number> = {}
  for (const n of NEEDED) {
    pos[n] = names.indexOf(n)
    if (pos[n] < 0) throw new Error(`Format des matchs ESPN inattendu (« ${n} » introuvable).`)
  }

  const lines: GameLine[] = []
  const regular = (raw.seasonTypes ?? []).filter((t) => /regular season/i.test(t.displayName ?? ''))
  for (const type of regular) {
    for (const category of type.categories ?? []) {
      for (const ev of category.events ?? []) {
        const fg = made(ev.stats[pos['fieldGoalsMade-fieldGoalsAttempted']] ?? '')
        const fg3 = made(ev.stats[pos['threePointFieldGoalsMade-threePointFieldGoalsAttempted']] ?? '')
        const ft = made(ev.stats[pos['freeThrowsMade-freeThrowsAttempted']] ?? '')
        if (!fg || !fg3 || !ft) continue // pas de statistiques : match non joué
        const n = (name: string) => Number(ev.stats[pos[name]]) || 0
        const ttfl = ttflScore({
          pts: n('points'),
          reb: n('totalRebounds'),
          ast: n('assists'),
          stl: n('steals'),
          blk: n('blocks'),
          ftm: ft[0],
          fgm: fg[0],
          fg3m: fg3[0],
          malus: malusFromBox({ tov: n('turnovers'), fgm: fg[0], fga: fg[1], fg3m: fg3[0], fg3a: fg3[1], ftm: ft[0], fta: ft[1] }),
        })
        lines.push({ date: raw.events?.[ev.eventId]?.gameDate ?? '', ttfl })
      }
    }
  }
  // du plus récent au plus ancien ; les dates ISO se comparent comme du texte
  return lines.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

/** Moyenne TTFL sur les `n` derniers matchs joués (moins s'il n'y en a pas autant), arrondie au centième. */
export function formAverage(lines: GameLine[], n: number): { avg: number; games: number } | undefined {
  const last = lines.slice(0, n)
  if (last.length === 0) return undefined
  const total = last.reduce((sum, l) => sum + l.ttfl, 0)
  return { avg: Math.round((total / last.length) * 100) / 100, games: last.length }
}

/** Ce que montre la moyenne d'un joueur : la saison, ses 10 derniers matchs ou ses 5 derniers. */
export type FormMode = 'season' | 'last10' | 'last5'

/** Un clic fait passer à la suite : saison → 10 derniers → 5 derniers → saison. */
export const nextFormMode = (mode: FormMode): FormMode => (mode === 'season' ? 'last10' : mode === 'last10' ? 'last5' : 'season')

/** Nombre de matchs que couvre chaque mode de forme. */
export const FORM_GAMES: Record<Exclude<FormMode, 'season'>, number> = { last10: 10, last5: 5 }
