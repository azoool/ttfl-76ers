import { describe, expect, it } from 'vitest'
import {
  duelFollowUp,
  duelHeadline,
  nbaDay,
  parseSchedule,
  stripDays,
  theTeam,
  tileTag,
  weekdayShort,
  type Duel,
  type RawSchedule,
} from '../src/lib/duels'

const event = (date: string, opp: [string, string, string], sixersHome: boolean, status = 'STATUS_SCHEDULED') => ({
  date,
  competitions: [
    {
      competitors: [
        { homeAway: sixersHome ? 'home' : 'away', team: { id: '20', abbreviation: 'PHI', shortDisplayName: '76ers' } },
        { homeAway: sixersHome ? 'away' : 'home', team: { id: opp[0], abbreviation: opp[1], shortDisplayName: opp[2] } },
      ],
      status: { type: { name: status } },
    },
  ],
})

const PACERS: [string, string, string] = ['11', 'IND', 'Pacers']
const ROCKETS: [string, string, string] = ['10', 'HOU', 'Rockets']
const HEAT: [string, string, string] = ['14', 'MIA', 'Heat']

describe('nbaDay', () => {
  it('rattache un match du soir américain à sa date, même après minuit à Paris', () => {
    expect(nbaDay('2026-11-28T00:30Z')).toBe('2026-11-27') // 01:30 à Paris le 28
    expect(nbaDay('2026-11-25T22:00Z')).toBe('2026-11-25')
  })
})

describe('parseSchedule', () => {
  it('donne l’adversaire de chaque jour de match, dans l’ordre des dates', () => {
    const raw: RawSchedule = { events: [event('2026-11-29T01:30Z', ROCKETS, false), event('2026-11-25T22:00Z', HEAT, true)] }
    expect(parseSchedule(raw)).toEqual([
      { date: '2026-11-25', abbr: 'MIA', nickname: 'Heat', atHome: true },
      { date: '2026-11-28', abbr: 'HOU', nickname: 'Rockets', atHome: false },
    ])
  })

  it('écarte un match reporté ou annulé', () => {
    const raw: RawSchedule = {
      events: [
        event('2026-11-28T00:30Z', PACERS, false, 'STATUS_POSTPONED'),
        event('2026-11-29T01:30Z', ROCKETS, false, 'STATUS_CANCELED'),
        event('2026-11-25T22:00Z', HEAT, true, 'STATUS_FINAL'),
      ],
    }
    expect(parseSchedule(raw).map((d) => d.abbr)).toEqual(['MIA'])
  })

  it('signale un format inattendu au lieu d’annoncer qu’il n’y a aucune confrontation', () => {
    expect(() => parseSchedule({})).toThrow(/inattendu/)
    expect(() => parseSchedule({ events: [{ date: '2026-11-28T00:30Z', competitions: [] }] })).toThrow(/inattendu/)
  })

  it('accepte un calendrier vide', () => {
    expect(parseSchedule({ events: [] })).toEqual([])
  })
})

describe('stripDays', () => {
  const today = '2026-11-27'

  it('montre sept jours à partir d’aujourd’hui, sans bouger quand on change de jour dans la semaine', () => {
    const week = ['2026-11-27', '2026-11-28', '2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03']
    expect(stripDays(today, today)).toEqual(week)
    expect(stripDays('2026-12-03', today)).toEqual(week)
  })

  it('passe à la semaine suivante ou précédente quand on en sort', () => {
    expect(stripDays('2026-12-04', today)[0]).toBe('2026-12-04')
    expect(stripDays('2026-11-26', today)).toEqual([
      '2026-11-20',
      '2026-11-21',
      '2026-11-22',
      '2026-11-23',
      '2026-11-24',
      '2026-11-25',
      '2026-11-26',
    ])
  })
})

describe('libellés', () => {
  const duels: Duel[] = [
    { date: '2026-11-25', abbr: 'MIA', nickname: 'Heat', atHome: true },
    { date: '2026-11-27', abbr: 'IND', nickname: 'Pacers', atHome: false },
    { date: '2026-11-28', abbr: 'HOU', nickname: 'Rockets', atHome: false },
    { date: '2026-12-01', abbr: 'MEM', nickname: 'Grizzlies', atHome: true },
  ]
  const today = '2026-11-27'
  const on = (date: string) => duels.find((d) => d.date === date)

  it('écrit « le Heat » et « les Trail Blazers »', () => {
    expect(theTeam('Heat')).toBe('le Heat')
    expect(theTeam('Trail Blazers')).toBe('les Trail Blazers')
  })

  it('marque l’extérieur d’un « @ », et l’absence de confrontation d’un tiret', () => {
    expect(tileTag(on('2026-11-27'))).toBe('@IND')
    expect(tileTag(on('2026-12-01'))).toBe('MEM')
    expect(tileTag(undefined)).toBe('–')
    expect(weekdayShort(today)).toBe('ven')
  })

  it('annonce la confrontation du jour affiché', () => {
    expect(duelHeadline(on(today), today, today)).toBe('Ce soir : confrontation contre les Pacers')
    expect(duelHeadline(on('2026-11-28'), '2026-11-28', today)).toBe('Demain : confrontation contre les Rockets')
    expect(duelHeadline(on('2026-11-25'), '2026-11-25', today)).toBe('Mer. 25 nov. : confrontation contre le Heat')
  })

  it('dit quand il n’y a pas de confrontation', () => {
    expect(duelHeadline(undefined, today, today)).toBe('Pas de confrontation ce soir')
    expect(duelHeadline(undefined, '2026-11-28', today)).toBe('Pas de confrontation demain')
    expect(duelHeadline(undefined, '2026-11-29', today)).toBe('Pas de confrontation le dim. 29 nov.')
  })

  it('annonce la confrontation d’après', () => {
    expect(duelFollowUp(duels, today, today)).toBe('La suivante : demain, contre les Rockets')
    expect(duelFollowUp(duels, '2026-11-29', today)).toBe('La prochaine : le mar. 1 déc., contre les Grizzlies')
    expect(duelFollowUp(duels, '2026-11-26', today)).toBe('La prochaine : ce soir, contre les Pacers')
    expect(duelFollowUp(duels, '2026-12-01', today)).toBe('Aucune autre confrontation au calendrier pour l’instant')
  })
})
