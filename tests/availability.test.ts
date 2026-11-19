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

  it('bloque les 29 jours suivants puis libère le joueur 30 jours après son pick', () => {
    expect(lockInfo(picks, 'Luka Doncic', '2026-11-02').state).toBe('locked') // 1 jour après
    expect(lockInfo(picks, 'Luka Doncic', '2026-11-30').state).toBe('locked') // 29 jours après
    expect(lockInfo(picks, 'Luka Doncic', '2026-12-01').state).toBe('free') // 30 jours après
    expect(lockInfo(picks, 'Luka Doncic', '2026-12-02').state).toBe('free')
  })

  it('indique quand le joueur redevient disponible', () => {
    expect(lockInfo(picks, 'Luka Doncic', '2026-11-15')).toMatchObject({
      state: 'locked',
      freeOn: '2026-12-01',
      daysLeft: 16,
      pickDate: '2026-11-01',
    })
  })

  // Relevé sur le deck de TTFL le 19/11/2026 : « bloqué N jours » pour 7 joueurs, avec la date de leur pick
  // dans l'historique du compte ; et Wembanyama (pické le 20/10, 30 jours plus tôt) disponible.
  describe('colle au deck de TTFL (relevé du 19/11/2026)', () => {
    const today = '2026-11-19'
    const cases: Array<[string, string, number]> = [
      ['Stephen Curry', '2026-10-30', 10],
      ['Yaxel Lendeborg', '2026-11-16', 27],
      ['Ty Jerome', '2026-11-09', 20],
      ['Ayo Dosunmu', '2026-11-12', 23],
      ['Jalen Brunson', '2026-11-15', 26],
      ['Karl-Anthony Towns', '2026-10-27', 7],
      ['Deni Avdija', '2026-10-31', 11],
    ]
    it.each(cases)('%s (pické le %s) : bloqué %i jours', (player, pickDate, ttflDays) => {
      expect(lockInfo([{ date: pickDate, player }], player, today)).toMatchObject({ state: 'locked', daysLeft: ttflDays })
    })

    it('Victor Wembanyama, pické le 20 octobre, est disponible le 19 novembre', () => {
      expect(lockInfo([{ date: '2026-10-20', player: 'Victor Wembanyama' }], 'Victor Wembanyama', today).state).toBe('free')
      // et la veille, il était encore bloqué 1 jour
      expect(lockInfo([{ date: '2026-10-20', player: 'Victor Wembanyama' }], 'Victor Wembanyama', '2026-11-18')).toMatchObject({
        state: 'locked',
        daysLeft: 1,
      })
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
    expect(lockInfo(planned, 'Nikola Jokic', '2026-10-22').state).toBe('locked') // 29 jours avant
    expect(lockInfo(planned, 'Nikola Jokic', '2026-10-21').state).toBe('free') // 30 jours avant
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
