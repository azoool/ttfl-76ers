import { describe, expect, it } from 'vitest'
import type { AvailabilityRow, Candidate } from '../src/lib/availability'
import {
  benchedFavorites,
  favoriteKey,
  favoriteRows,
  parseFavorites,
  removeFavorite,
  splitByAvailability,
  toggleFavorite,
  type Favorite,
} from '../src/lib/favorites'
import { indexStats } from '../src/lib/seasonStats'

const row = (name: string, id?: string, team = 'PHI'): AvailabilityRow => ({
  candidate: { id, name, team, teamId: team } as Candidate,
  perMember: {},
  freeCount: 0,
  total: 0,
})

describe('favoriteKey', () => {
  it('utilise l’identifiant ESPN quand il existe, sinon le nom sans accents ni suffixe', () => {
    expect(favoriteKey({ id: '3945274', name: 'Luka Doncic' })).toBe('id:3945274')
    expect(favoriteKey({ name: 'Luka Dončić' })).toBe(favoriteKey({ name: 'luka doncic' }))
    expect(favoriteKey({ name: 'Jaren Jackson Jr.' })).toBe('n:jaren jackson')
  })
})

describe('toggleFavorite', () => {
  it('ajoute un joueur puis le retire au second appel', () => {
    const luka = { id: '1', name: 'Luka Doncic' }
    const once = toggleFavorite([], luka)
    expect(once).toEqual([{ key: 'id:1', name: 'Luka Doncic' }])
    expect(toggleFavorite(once, luka)).toEqual([])
  })

  it('ne touche pas aux autres favoris', () => {
    const list: Favorite[] = [{ key: 'id:1', name: 'A' }]
    expect(toggleFavorite(list, { id: '2', name: 'B' })).toHaveLength(2)
    expect(removeFavorite(list, 'id:1')).toEqual([])
  })
})

describe('parseFavorites', () => {
  it('relit une liste valide', () => {
    expect(parseFavorites('[{"key":"id:1","name":"A"}]')).toEqual([{ key: 'id:1', name: 'A' }])
  })

  it('ignore le contenu illisible, mal formé ou en double', () => {
    expect(parseFavorites(null)).toEqual([])
    expect(parseFavorites('pas du json')).toEqual([])
    expect(parseFavorites('{"key":"id:1"}')).toEqual([])
    expect(parseFavorites('[null, {"key":1,"name":"x"}, {"key":"id:2"}, {"key":"id:3","name":"C"}, {"key":"id:3","name":"C bis"}]')).toEqual([
      { key: 'id:3', name: 'C' },
    ])
  })
})

describe('favoriteRows', () => {
  const stats = indexStats({
    season: '2026-27',
    players: [
      { id: '1', name: 'Joel Embiid', gp: 10, avg: 30.6 },
      { id: '2', name: 'Tyrese Maxey', gp: 15, avg: 38.8 },
      { id: '3', name: 'Quentin Grimes', gp: 12, avg: 38.84 }, // même affichage que Maxey (38,8)
    ],
  })
  const rows = [row('Joel Embiid', '1'), row('Tyrese Maxey', '2'), row('Quentin Grimes', '3'), row('Dean Wade', '9'), row('Kelly Oubre Jr.', '8')]

  it('ne garde que les favoris, classés par moyenne TTFL puis par nom, sans moyenne en dernier', () => {
    const keys = new Set(['id:1', 'id:2', 'id:3', 'id:9', 'id:8'])
    expect(favoriteRows(rows, keys, stats).map((r) => r.row.candidate.name)).toEqual([
      'Quentin Grimes', // 38,8 : égalité d'affichage avec Maxey, départagée par le nom
      'Tyrese Maxey',
      'Joel Embiid',
      'Dean Wade', // sans moyenne : en dernier, par nom
      'Kelly Oubre Jr.',
    ])
  })

  it('ignore les joueurs qui ne sont pas en favori', () => {
    expect(favoriteRows(rows, new Set(['id:1']), stats).map((r) => r.row.candidate.name)).toEqual(['Joel Embiid'])
    expect(favoriteRows(rows, new Set(), stats)).toEqual([])
  })

  it('expose la moyenne de chaque favori', () => {
    expect(favoriteRows(rows, new Set(['id:2']), stats)[0].stat).toMatchObject({ avg: 38.8, gp: 15 })
  })
})

describe('benchedFavorites', () => {
  it('liste les favoris dont l’équipe ne joue pas ce jour-là', () => {
    const favorites: Favorite[] = [
      { key: 'id:1', name: 'Joel Embiid' },
      { key: 'id:7', name: 'Nikola Jokic' },
    ]
    const playing = [{ id: '1', name: 'Joel Embiid', team: 'PHI' }]
    expect(benchedFavorites(favorites, playing)).toEqual([{ key: 'id:7', name: 'Nikola Jokic' }])
  })
})

describe('splitByAvailability', () => {
  const ranked = (name: string, freeCount: number, total: number) => ({
    row: { candidate: { name, team: 'PHI' }, perMember: {}, freeCount, total } as AvailabilityRow,
  })

  it('sépare les joueurs libres pour tous les membres comptés des autres, en gardant l’ordre', () => {
    const rows = [ranked('A', 1, 1), ranked('B', 0, 1), ranked('C', 1, 1), ranked('D', 0, 1)]
    const { free, blocked } = splitByAvailability(rows)
    expect(free.map((r) => r.row.candidate.name)).toEqual(['A', 'C'])
    expect(blocked.map((r) => r.row.candidate.name)).toEqual(['B', 'D'])
  })

  it('avec plusieurs membres comptés, il faut qu’ils soient tous libres', () => {
    const { free, blocked } = splitByAvailability([ranked('A', 2, 2), ranked('B', 1, 2), ranked('C', 0, 2)])
    expect(free.map((r) => r.row.candidate.name)).toEqual(['A'])
    expect(blocked.map((r) => r.row.candidate.name)).toEqual(['B', 'C'])
  })

  it('sans membre compté, personne n’est bloqué', () => {
    const { free, blocked } = splitByAvailability([ranked('A', 0, 0), ranked('B', 0, 0)])
    expect(free).toHaveLength(2)
    expect(blocked).toEqual([])
  })
})
