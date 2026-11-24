import { describe, expect, it } from 'vitest'
import type { Game, TeamRef } from '../src/lib/espn'
import { matchupLabel, matchupSymbol, opponentsByTeam } from '../src/lib/matchups'

const team = (id: string, abbr: string, name: string, logo?: string): TeamRef => ({ id, abbr, name, logo })
const PHI = team('20', 'PHI', 'Philadelphia 76ers', 'phi.png')
const BOS = team('2', 'BOS', 'Boston Celtics', 'bos.png')
const NYK = team('18', 'NY', 'New York Knicks')
const LAL = team('13', 'LAL', 'Los Angeles Lakers', 'lal.png')

const game = (id: string, home: TeamRef, away: TeamRef): Game => ({ id, startUtc: '2026-11-25T00:00:00Z', home, away, state: 'pre' })

describe('opponentsByTeam', () => {
  const games = [game('g1', PHI, BOS), game('g2', NYK, LAL)]
  const map = opponentsByTeam(games)

  it('donne à l’équipe qui reçoit son visiteur comme adversaire, à domicile', () => {
    expect(map.get('20')).toEqual({ team: BOS, atHome: true })
    expect(map.get('18')).toEqual({ team: LAL, atHome: true })
  })

  it('donne à l’équipe visiteuse son hôte comme adversaire, à l’extérieur', () => {
    expect(map.get('2')).toEqual({ team: PHI, atHome: false })
    expect(map.get('13')).toEqual({ team: NYK, atHome: false })
  })

  it('ne connaît pas une équipe qui ne joue pas ce jour-là', () => {
    expect(map.get('99')).toBeUndefined()
    expect(opponentsByTeam([]).size).toBe(0)
  })

  it('garde le premier match si une équipe apparaissait deux fois', () => {
    const twice = opponentsByTeam([game('a', PHI, BOS), game('b', LAL, PHI)])
    expect(twice.get('20')).toEqual({ team: BOS, atHome: true })
  })
})

describe('matchupSymbol / matchupLabel', () => {
  it('affiche « vs » à domicile et « @ » à l’extérieur', () => {
    expect(matchupSymbol({ team: BOS, atHome: true })).toBe('vs')
    expect(matchupSymbol({ team: PHI, atHome: false })).toBe('@')
  })

  it('décrit le match en toutes lettres', () => {
    expect(matchupLabel({ team: BOS, atHome: true })).toBe('À domicile contre Boston Celtics')
    expect(matchupLabel({ team: PHI, atHome: false })).toBe('À l’extérieur chez Philadelphia 76ers')
  })
})
