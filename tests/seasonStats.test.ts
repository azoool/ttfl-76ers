import { describe, expect, it } from 'vitest'
import { indexStats, parseSeasonStats, type RawSeasonStats } from '../src/lib/seasonStats'

// Même structure que la réponse d'ESPN (`statistics/byathlete`) : les valeurs de chaque joueur
// suivent l'ordre des noms déclarés dans `categories`.
const categories = [
  {
    name: 'general',
    names: ['gamesPlayed', 'avgMinutes', 'avgFouls', 'flagrantFouls', 'technicalFouls', 'ejections', 'doubleDouble', 'tripleDouble', 'minutes', 'rebounds', 'fouls', 'avgRebounds'],
  },
  {
    name: 'offensive',
    names: [
      'avgPoints', 'avgFieldGoalsMade', 'avgFieldGoalsAttempted', 'fieldGoalPct', 'avgThreePointFieldGoalsMade',
      'avgThreePointFieldGoalsAttempted', 'threePointFieldGoalPct', 'avgFreeThrowsMade', 'avgFreeThrowsAttempted',
      'freeThrowPct', 'avgAssists', 'avgTurnovers', 'points', 'fieldGoalsMade', 'fieldGoalsAttempted',
      'threePointFieldGoalsMade', 'threePointFieldGoalsAttempted', 'freeThrowsMade', 'freeThrowsAttempted', 'assists', 'turnovers',
    ],
  },
  { name: 'defensive', names: ['avgSteals', 'avgBlocks', 'steals', 'blocks'] },
]

function athlete(id: string, displayName: string, general: number[], offensive: number[], defensive: number[]) {
  return {
    athlete: { id, displayName },
    categories: [
      { name: 'general', values: general },
      { name: 'offensive', values: offensive },
      { name: 'defensive', values: defensive },
    ],
  }
}

// Luka Dončić, 13 matchs : 504 pts, 93 reb, 100 ast, 24 stl, 9 blk, 120/140 LF, 157/330 tirs, 70/176 à 3 pts, 62 pertes.
// Points : 504+93+100+24+9+120+157+70 = 1077. Malus : 62 + 173 + 106 + 20 = 361. Total 716 / 13 = 55,08.
const luka = athlete(
  '3945274',
  'Luka Doncic',
  [13, 36.4, 3, 0, 3, 0, 4, 0, 473, 93, 39, 7.15],
  [38.77, 12.08, 25.38, 47.6, 5.38, 13.54, 39.8, 9.23, 10.77, 85.7, 7.69, 4.77, 504, 157, 330, 70, 176, 120, 140, 100, 62],
  [1.85, 0.69, 24, 9],
)
const nobody = athlete('1', 'Rookie Nul', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], new Array(21).fill(0), [0, 0, 0, 0])

const raw: RawSeasonStats = {
  requestedSeason: { displayName: '2026-27' },
  categories,
  athletes: [luka, nobody],
}

describe('parseSeasonStats', () => {
  it('calcule la moyenne TTFL à partir des totaux de la saison', () => {
    const { season, players } = parseSeasonStats(raw)
    expect(season).toBe('2026-27')
    expect(players).toHaveLength(1) // le joueur sans match est ignoré
    expect(players[0]).toMatchObject({ id: '3945274', name: 'Luka Doncic', gp: 13 })
    expect(players[0].avg).toBeCloseTo(55.08, 2)
  })

  it('refuse un format inattendu plutôt que d’afficher des moyennes fausses', () => {
    const broken = { ...raw, categories: categories.map((c) => (c.name === 'defensive' ? { ...c, names: ['avgSteals'] } : c)) }
    expect(() => parseSeasonStats(broken)).toThrow(/defensive\.steals/)
  })
})

describe('indexStats', () => {
  const index = indexStats(parseSeasonStats(raw))

  it('retrouve un joueur par identifiant ESPN, même si le nom diffère', () => {
    expect(index.find('3945274', 'Autre nom')?.name).toBe('Luka Doncic')
  })

  it('retrouve un joueur par son nom, accents et casse ignorés', () => {
    expect(index.find(undefined, 'Luka Dončić')?.id).toBe('3945274')
    expect(index.find('999', 'LUKA DONCIC')?.id).toBe('3945274')
  })

  it('ne trouve rien pour un joueur sans moyenne', () => {
    expect(index.find('1', 'Rookie Nul')).toBeUndefined()
  })
})
