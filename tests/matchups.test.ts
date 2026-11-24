import { describe, expect, it } from 'vitest'
import type { Game, TeamRef } from '../src/lib/espn'
import { matchupLabel, matchupSymbol, matchupTime, opponentsByTeam } from '../src/lib/matchups'

const team = (id: string, abbr: string, name: string, logo?: string): TeamRef => ({ id, abbr, name, logo })
const PHI = team('20', 'PHI', 'Philadelphia 76ers', 'phi.png')
const BOS = team('2', 'BOS', 'Boston Celtics', 'bos.png')
const NYK = team('18', 'NY', 'New York Knicks')
const LAL = team('13', 'LAL', 'Los Angeles Lakers', 'lal.png')

const game = (id: string, home: TeamRef, away: TeamRef): Game => ({ id, startUtc: '2026-11-25T01:00:00Z', home, away, state: 'pre' })

describe('opponentsByTeam', () => {
  const games = [game('g1', PHI, BOS), game('g2', NYK, LAL)]
  const map = opponentsByTeam(games)

  it('donne à l’équipe qui reçoit son visiteur comme adversaire, à domicile', () => {
    expect(map.get('20')).toEqual({ team: BOS, atHome: true, startUtc: '2026-11-25T01:00:00Z' })
    expect(map.get('18')).toEqual({ team: LAL, atHome: true, startUtc: '2026-11-25T01:00:00Z' })
  })

  it('donne à l’équipe visiteuse son hôte comme adversaire, à l’extérieur', () => {
    expect(map.get('2')).toEqual({ team: PHI, atHome: false, startUtc: '2026-11-25T01:00:00Z' })
    expect(map.get('13')).toEqual({ team: NYK, atHome: false, startUtc: '2026-11-25T01:00:00Z' })
  })

  it('ne connaît pas une équipe qui ne joue pas ce jour-là', () => {
    expect(map.get('99')).toBeUndefined()
    expect(opponentsByTeam([]).size).toBe(0)
  })

  it('garde le premier match si une équipe apparaissait deux fois', () => {
    const twice = opponentsByTeam([game('a', PHI, BOS), game('b', LAL, PHI)])
    expect(twice.get('20')).toEqual({ team: BOS, atHome: true, startUtc: '2026-11-25T01:00:00Z' })
  })
})

describe('matchupSymbol / matchupLabel', () => {
  it('affiche « vs » à domicile et « @ » à l’extérieur', () => {
    expect(matchupSymbol({ team: BOS, atHome: true, startUtc: '2026-11-25T01:00:00Z' })).toBe('vs')
    expect(matchupSymbol({ team: PHI, atHome: false, startUtc: '2026-11-25T01:00:00Z' })).toBe('@')
  })

  it('décrit le match en toutes lettres', () => {
    expect(matchupLabel({ team: BOS, atHome: true, startUtc: '2026-11-25T01:00:00Z' })).toBe('À domicile contre Boston Celtics')
    expect(matchupLabel({ team: PHI, atHome: false, startUtc: '2026-11-25T01:00:00Z' })).toBe('À l’extérieur chez Philadelphia 76ers')
  })
})

describe('matchupTime', () => {
  it('donne l’heure du coup d’envoi à Paris, après minuit pour un match du soir américain', () => {
    expect(matchupTime({ team: BOS, atHome: true, startUtc: '2026-11-25T01:00:00Z' })).toBe('02:00') // hiver : UTC+1
    expect(matchupTime({ team: BOS, atHome: true, startUtc: '2026-07-25T00:30:00Z' })).toBe('02:30') // été : UTC+2
  })
})
