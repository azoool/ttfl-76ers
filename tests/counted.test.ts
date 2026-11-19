import { describe, expect, it } from 'vitest'
import { defaultCounted, parseCounted, resolveCounted } from '../src/lib/counted'

const team = [
  { id: 'a', me: false },
  { id: 'b', me: true },
  { id: 'c', me: false },
]

describe('defaultCounted', () => {
  it('ne compte que moi quand on sait qui je suis', () => {
    expect(defaultCounted(team)).toEqual(['b'])
  })

  it('compte tout le monde quand on ne sait pas qui je suis (historiques importés sur l’appareil)', () => {
    expect(defaultCounted([{ id: 'x' }, { id: 'y' }])).toEqual(['x', 'y'])
    expect(defaultCounted([])).toEqual([])
  })
})

describe('resolveCounted', () => {
  it('prend le défaut tant que rien n’a été choisi', () => {
    expect([...resolveCounted(team)]).toEqual(['b'])
  })

  it('respecte le choix mémorisé, par exemple toute l’équipe', () => {
    expect([...resolveCounted(team, ['a', 'b', 'c'])].sort()).toEqual(['a', 'b', 'c'])
    expect([...resolveCounted(team, ['a'])]).toEqual(['a'])
  })

  it('ignore les membres mémorisés qui n’existent plus', () => {
    expect([...resolveCounted(team, ['a', 'zzz'])]).toEqual(['a'])
  })

  it('retombe sur le défaut si plus aucun membre mémorisé n’existe', () => {
    expect([...resolveCounted(team, ['zzz'])]).toEqual(['b'])
  })

  it('garde une sélection volontairement vide', () => {
    expect(resolveCounted(team, []).size).toBe(0)
  })

  it('ne compte pas un nouveau membre arrivé après le choix', () => {
    expect([...resolveCounted([...team, { id: 'new', me: false }], ['b'])]).toEqual(['b'])
  })
})

describe('parseCounted', () => {
  it('relit un stockage valide', () => {
    expect(parseCounted('{"team:1:m":["a","b"],"local":[]}')).toEqual({ 'team:1:m': ['a', 'b'], local: [] })
  })

  it('ignore le contenu illisible ou mal formé', () => {
    expect(parseCounted(null)).toEqual({})
    expect(parseCounted('pas du json')).toEqual({})
    expect(parseCounted('["a"]')).toEqual({})
    expect(parseCounted('{"ok":["a"],"mal":[1,2],"autre":"x"}')).toEqual({ ok: ['a'] })
  })
})
