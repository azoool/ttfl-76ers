import { describe, expect, it } from 'vitest'
import { availabilityRows, lockInfo, type Member } from '../src/lib/availability'
import { addDays, daysBetween, parisToday } from '../src/lib/dates'

describe('dates', () => {
  it('calcule des écarts en jours sans effet du changement d’heure', () => {
    expect(daysBetween('2026-10-24', '2026-10-27')).toBe(3) // passage à l'heure d'hiver le 25/10/2026
    expect(daysBetween('2026-11-15', '2026-11-01')).toBe(-14)
    expect(addDays('2026-11-01', 31)).toBe('2026-12-02')
  })

  it('donne la date du jour à Paris, pas celle d’UTC', () => {
    // 23h30 UTC le 16/11 = 00h30 le 17/11 à Paris
    expect(parisToday(new Date('2026-11-16T23:30:00Z'))).toBe('2026-11-17')
    expect(parisToday(new Date('2026-11-16T12:00:00Z'))).toBe('2026-11-16')
  })
})

describe('lockInfo (verrou de 30 jours)', () => {
  const picks = [{ date: '2026-11-01', player: 'Luka Dončić' }]

  it('bloque pendant les 30 jours suivants puis libère le 31e', () => {
    expect(lockInfo(picks, 'Luka Doncic', '2026-11-02').state).toBe('locked')
    expect(lockInfo(picks, 'Luka Doncic', '2026-12-01').state).toBe('locked') // 30 jours après
    expect(lockInfo(picks, 'Luka Doncic', '2026-12-02').state).toBe('free') // 31 jours après
  })

  it('indique quand le joueur redevient disponible', () => {
    expect(lockInfo(picks, 'Luka Doncic', '2026-11-15')).toMatchObject({
      state: 'locked',
      freeOn: '2026-12-02',
      daysLeft: 17,
      pickDate: '2026-11-01',
    })
  })

  it('reconnaît le pick du jour', () => {
    expect(lockInfo(picks, 'Luka Doncic', '2026-11-01').state).toBe('picked')
  })

  it('ne confond pas deux joueurs différents', () => {
    expect(lockInfo(picks, 'Nikola Jokic', '2026-11-10').state).toBe('free')
  })

  it('un pick préparé à l’avance bloque aussi les jours qui précèdent', () => {
    const planned = [{ date: '2026-11-20', player: 'Nikola Jokić' }]
    expect(lockInfo(planned, 'Nikola Jokic', '2026-11-10')).toMatchObject({ state: 'locked', pickDate: '2026-11-20' })
    expect(lockInfo(planned, 'Nikola Jokic', '2026-10-10').state).toBe('free')
  })

  it('retient le pick passé le plus récent', () => {
    const two = [
      { date: '2026-09-01', player: 'Luka Dončić' },
      { date: '2026-11-01', player: 'Luka Dončić' },
    ]
    expect(lockInfo(two, 'Luka Doncic', '2026-11-10').pickDate).toBe('2026-11-01')
  })
})

describe('availabilityRows', () => {
  const members: Member[] = [
    { id: 'a', name: 'A', picks: [{ date: '2026-11-10', player: 'Jalen Brunson' }] },
    { id: 'b', name: 'B', picks: [] },
  ]
  const candidates = [
    { name: 'Jalen Brunson', team: 'NYK' },
    { name: 'Karl-Anthony Towns', team: 'NYK' },
  ]

  it('compte les membres qui peuvent prendre chaque joueur et trie les plus disponibles en premier', () => {
    const rows = availabilityRows(members, candidates, '2026-11-17')
    expect(rows.map((r) => r.candidate.name)).toEqual(['Karl-Anthony Towns', 'Jalen Brunson'])
    expect(rows[0]).toMatchObject({ freeCount: 2, total: 2 })
    expect(rows[1]).toMatchObject({ freeCount: 1, total: 2 })
    expect(rows[1].perMember.a.state).toBe('locked')
    expect(rows[1].perMember.b.state).toBe('free')
  })
})
