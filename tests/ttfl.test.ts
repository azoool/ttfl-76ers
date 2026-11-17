import { describe, expect, it } from 'vitest'
import { malusFromBox, playerKey, ttflScore } from '../src/lib/ttfl'
import { removeMember, upsertMember } from '../src/lib/storage'

describe('ttflScore', () => {
  it('reproduit l’exemple de la FAQ TTFL (46)', () => {
    // 28 pts, 10 reb, 6 ast, 2 stl, 1 blk, 11/20 aux tirs dont 3/7 à 3 pts, 3/4 LF, 4 balles perdues
    const malus = malusFromBox({ tov: 4, fgm: 11, fga: 20, fg3m: 3, fg3a: 7, ftm: 3, fta: 4 })
    expect(malus).toBe(18)
    expect(ttflScore({ pts: 28, reb: 10, ast: 6, stl: 2, blk: 1, ftm: 3, fgm: 11, fg3m: 3, malus })).toBe(46)
  })

  it('colle aux scores officiels lus dans un historique réel', () => {
    expect(ttflScore({ pts: 12, reb: 13, ast: 3, stl: 1, blk: 6, ftm: 10, fgm: 1, fg3m: 0, malus: 22 })).toBe(24)
  })
})

describe('playerKey', () => {
  it('ignore accents, casse, ponctuation et suffixes', () => {
    expect(playerKey('Luka Dončić')).toBe(playerKey('luka doncic'))
    expect(playerKey('Nikola Jokić')).toBe('nikola jokic')
    expect(playerKey('Jaren Jackson Jr.')).toBe('jaren jackson')
    expect(playerKey("De'Aaron Fox")).toBe('deaaron fox')
    expect(playerKey('Karl-Anthony Towns')).toBe('karl anthony towns')
    expect(playerKey('Alperen Şengün')).toBe('alperen sengun')
  })
})

describe('upsertMember', () => {
  const t = new Date('2026-11-17T10:00:00Z')

  it('crée un membre puis fusionne ses picks par date sans doublon', () => {
    let ms = upsertMember([], ' Knicko ', [{ date: '2026-11-01', player: 'A' }], t, () => 'id1')
    ms = upsertMember(
      ms,
      'knicko',
      [
        { date: '2026-11-01', player: 'A2' },
        { date: '2026-11-02', player: 'B' },
      ],
      t,
      () => 'id2',
    )
    expect(ms).toHaveLength(1)
    expect(ms[0]).toMatchObject({ id: 'id1', name: 'Knicko' })
    expect(ms[0].picks).toEqual([
      { date: '2026-11-02', player: 'B' },
      { date: '2026-11-01', player: 'A2' },
    ])
  })

  it('supprime un membre', () => {
    const ms = upsertMember([], 'X', [], t, () => 'id1')
    expect(removeMember(ms, 'id1')).toEqual([])
  })
})
