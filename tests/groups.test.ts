import { describe, expect, it } from 'vitest'
import type { AvailabilityRow, Candidate } from '../src/lib/availability'
import type { TeamRef } from '../src/lib/espn'
import { groupByTeam } from '../src/lib/groups'
import { indexStats } from '../src/lib/seasonStats'

const teams: TeamRef[] = [
  { id: '20', abbr: 'PHI', name: 'Philadelphia 76ers', logo: 'phi.png' },
  { id: '2', abbr: 'BOS', name: 'Boston Celtics', logo: 'bos.png' },
  { id: '13', abbr: 'LAL', name: 'Los Angeles Lakers' },
  { id: '12', abbr: 'LAC', name: 'LA Clippers' },
]

const row = (name: string, teamId: string, id?: string): AvailabilityRow => {
  const candidate: Candidate = { id, name, team: teams.find((t) => t.id === teamId)!.abbr, teamId }
  return { candidate, perMember: {}, freeCount: 0, total: 0 }
}

const stats = indexStats({
  season: '2026-27',
  players: [
    { id: '1', name: 'Joel Embiid', gp: 10, avg: 48.04 },
    { id: '2', name: 'Tyrese Maxey', gp: 12, avg: 40.2 },
    { id: '3', name: 'Quentin Grimes', gp: 12, avg: 40.24 }, // même affichage (40,2) que Maxey
    { id: '4', name: 'Jayson Tatum', gp: 9, avg: 45.5 },
  ],
})

describe('groupByTeam', () => {
  const rows = [
    row('Tyrese Maxey', '20', '2'),
    row('Jayson Tatum', '2', '4'),
    row('Joel Embiid', '20', '1'),
    row('Dean Wade', '20', '9'), // sans moyenne
    row('Quentin Grimes', '20', '3'),
    row('Andre Drummond', '20', '8'), // sans moyenne
  ]

  it('classe les équipes par ordre alphabétique du nom complet et ignore celles sans joueur', () => {
    expect(groupByTeam(rows, teams, stats).map((g) => g.name)).toEqual(['Boston Celtics', 'Philadelphia 76ers'])
  })

  it('range chaque équipe par moyenne TTFL décroissante, puis par nom', () => {
    const phi = groupByTeam(rows, teams, stats).find((g) => g.abbr === 'PHI')!
    expect(phi.rows.map((r) => r.row.candidate.name)).toEqual([
      'Joel Embiid', // 48,0
      'Quentin Grimes', // 40,2 : égalité à l'affichage avec Maxey, départagée par le nom
      'Tyrese Maxey', // 40,2
      'Andre Drummond', // sans moyenne : en dernier, par nom
      'Dean Wade',
    ])
  })

  it('garde le logo et expose la moyenne de chaque joueur', () => {
    const phi = groupByTeam(rows, teams, stats).find((g) => g.abbr === 'PHI')!
    expect(phi.logo).toBe('phi.png')
    expect(phi.rows[0].stat).toMatchObject({ avg: 48.04, gp: 10 })
    expect(phi.rows[4].stat).toBeUndefined()
  })

  it('classe par nom quand les moyennes ne sont pas disponibles', () => {
    const phi = groupByTeam(rows, teams).find((g) => g.abbr === 'PHI')!
    expect(phi.rows.map((r) => r.row.candidate.name)).toEqual([
      'Andre Drummond',
      'Dean Wade',
      'Joel Embiid',
      'Quentin Grimes',
      'Tyrese Maxey',
    ])
  })

  it('place « LA Clippers » avant « Los Angeles Lakers » (ordre alphabétique)', () => {
    const both = [row('Kawhi Leonard', '12'), row('LeBron James', '13')]
    expect(groupByTeam(both, teams).map((g) => g.name)).toEqual(['LA Clippers', 'Los Angeles Lakers'])
  })

  it('crée un groupe de secours pour un joueur dont l’équipe est inconnue', () => {
    const odd: AvailabilityRow = { candidate: { name: 'Inconnu', team: 'XXX', teamId: '999' }, perMember: {}, freeCount: 0, total: 0 }
    expect(groupByTeam([odd], teams)).toMatchObject([{ id: '999', name: 'XXX' }])
  })
})
