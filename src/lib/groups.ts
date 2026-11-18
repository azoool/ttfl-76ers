import type { AvailabilityRow } from './availability'
import type { TeamRef } from './espn'
import type { SeasonStat, StatsIndex } from './seasonStats'

export interface RankedRow {
  row: AvailabilityRow
  stat?: SeasonStat
}

export interface TeamGroup {
  id: string
  /** nom complet, ex. « Philadelphia 76ers » */
  name: string
  abbr: string
  logo?: string
  rows: RankedRow[]
}

/** Moyenne telle qu'elle est affichée (une décimale) : deux joueurs à égalité d'affichage se départagent par le nom. */
const shown = (s?: SeasonStat) => (s ? Math.round(s.avg * 10) / 10 : undefined)

function byAverageThenName(a: RankedRow, b: RankedRow): number {
  const x = shown(a.stat)
  const y = shown(b.stat)
  if (x !== y) {
    if (x === undefined) return 1 // sans moyenne : après les autres
    if (y === undefined) return -1
    return y - x
  }
  return a.row.candidate.name.localeCompare(b.row.candidate.name, 'fr')
}

/**
 * Regroupe les joueurs par équipe (équipes par ordre alphabétique du nom complet).
 * Dans chaque équipe : moyenne TTFL de la saison décroissante, puis nom.
 */
export function groupByTeam(rows: AvailabilityRow[], teams: TeamRef[], stats?: StatsIndex): TeamGroup[] {
  const groups = new Map<string, TeamGroup>()
  for (const team of teams) {
    groups.set(team.id, { id: team.id, name: team.name, abbr: team.abbr, logo: team.logo, rows: [] })
  }
  for (const row of rows) {
    const c = row.candidate
    const id = c.teamId ?? c.team
    let group = groups.get(id)
    if (!group) {
      group = { id, name: c.team, abbr: c.team, rows: [] }
      groups.set(id, group)
    }
    group.rows.push({ row, stat: stats?.find(c.id, c.name) })
  }
  return [...groups.values()]
    .filter((g) => g.rows.length > 0)
    .map((g) => ({ ...g, rows: [...g.rows].sort(byAverageThenName) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}
