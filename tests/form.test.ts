import { describe, expect, it } from 'vitest'
import { formAverage, nextFormMode, parseGameLog, type RawGameLog } from '../src/lib/form'

const names = [
  'minutes',
  'fieldGoalsMade-fieldGoalsAttempted',
  'fieldGoalPct',
  'threePointFieldGoalsMade-threePointFieldGoalsAttempted',
  'threePointFieldGoalPct',
  'freeThrowsMade-freeThrowsAttempted',
  'freeThrowPct',
  'totalRebounds',
  'assists',
  'blocks',
  'steals',
  'personalFouls',
  'turnovers',
  'points',
]

// minutes, fg, %, 3pt, %, ft, %, reb, ast, blk, stl, pf, tov, pts
const box = (fg: string, fg3: string, ft: string, reb: number, ast: number, blk: number, stl: number, tov: number, pts: number) =>
  ['30', fg, '0', fg3, '0', ft, '0', reb, ast, blk, stl, 2, tov, pts].map(String)

const raw = (events: Array<{ id: string; date: string; stats: string[] }>, type = 'Regular Season'): RawGameLog => ({
  names,
  events: Object.fromEntries(events.map((e) => [e.id, { gameDate: e.date }])),
  seasonTypes: [{ displayName: `2026-27 ${type}`, categories: [{ events: events.map((e) => ({ eventId: e.id, stats: e.stats })) }] }],
})

describe('parseGameLog', () => {
  // 10 pts + 5 reb + 5 ast + 1 stl + 1 blk + 2 ftm + 4 fgm + 1 3pm = 29 ; malus 2 + (9-4) + (3-1) + (2-2) = 9 → 20
  const game = box('4-9', '1-3', '2-2', 5, 5, 1, 1, 2, 10)

  it('calcule le score TTFL d’un match', () => {
    const lines = parseGameLog(raw([{ id: 'a', date: '2026-11-20T01:00Z', stats: game }]))
    expect(lines).toEqual([{ date: '2026-11-20T01:00Z', ttfl: 20 }])
  })

  it('trie du plus récent au plus ancien', () => {
    const lines = parseGameLog(
      raw([
        { id: 'a', date: '2026-11-18T01:00Z', stats: game },
        { id: 'b', date: '2026-11-22T01:00Z', stats: game },
        { id: 'c', date: '2026-11-20T01:00Z', stats: game },
      ]),
    )
    expect(lines.map((l) => l.date)).toEqual(['2026-11-22T01:00Z', '2026-11-20T01:00Z', '2026-11-18T01:00Z'])
  })

  it('ignore les matchs sans statistiques (absent, non utilisé)', () => {
    const dnp = names.map(() => '-')
    const lines = parseGameLog(raw([{ id: 'a', date: '2026-11-20T01:00Z', stats: dnp }, { id: 'b', date: '2026-11-21T01:00Z', stats: game }]))
    expect(lines).toHaveLength(1)
  })

  it('ne garde que la saison régulière', () => {
    expect(parseGameLog(raw([{ id: 'a', date: '2026-04-20T01:00Z', stats: game }], 'Postseason'))).toEqual([])
  })

  it('signale un format inattendu', () => {
    expect(() => parseGameLog({ names: ['points'], seasonTypes: [] })).toThrow(/introuvable/)
  })
})

describe('formAverage', () => {
  const lines = [30, 20, 10, 40].map((ttfl, i) => ({ date: String(10 - i), ttfl }))

  it('moyenne les n derniers matchs, du plus récent au plus ancien', () => {
    expect(formAverage(lines, 2)).toEqual({ avg: 25, games: 2 })
  })

  it('se contente des matchs disponibles s’il y en a moins que demandé', () => {
    expect(formAverage(lines, 10)).toEqual({ avg: 25, games: 4 })
  })

  it('arrondit au centième et ne renvoie rien sans match', () => {
    expect(formAverage([{ date: 'a', ttfl: 10 }, { date: 'b', ttfl: 10 }, { date: 'c', ttfl: 11 }], 3)?.avg).toBe(10.33)
    expect(formAverage([], 5)).toBeUndefined()
  })
})

describe('nextFormMode', () => {
  it('passe de la saison aux 10 derniers, puis aux 5 derniers, puis revient à la saison', () => {
    expect(nextFormMode('season')).toBe('last10')
    expect(nextFormMode('last10')).toBe('last5')
    expect(nextFormMode('last5')).toBe('season')
  })
})
