import { describe, expect, it } from 'vitest'
import { parseHistory } from '../src/lib/parseHistory'

// Format réel de la page "Historique des decks" (?tpl=historique) : en-tête répété, lignes de données,
// puis pagination. Les lignes de données ci-dessous sont des box scores NBA publics.
const PASTE = [
  'Historique des decks',
  'Tout le détail des points par joueur et par jour',
  'Afficher',
  '10',
  '25',
  'lignes',
  'Rechercher:',
  'Date\tJoueur\tPts\tReb\tAst\tStl\tBlk\tFtm\tFgm\tFg3m\tMalus\tScore\tBonus x2',
  'Date\tJoueur\tPts\tReb\tAst\tStl\tBlk\tFtm\tFgm\tFg3m\tMalus\tScore',
  '2026-11-16\tYaxel Lendeborg\t28\t8\t3\t1\t2\t8\t9\t2\t25\t36\tnon',
  '2026-10-20 Victor Wembanyama 12 13 3 1 6 10 1 0 22 24 oui',
  'Page 1 sur 1',
  'Précedent',
  '1',
  'Suivant',
].join('\n')

describe('parseHistory', () => {
  it('lit un tableau copié avec tabulations ou espaces et ignore en-têtes et pagination', () => {
    const r = parseHistory(PASTE)
    expect(r.unknown).toEqual([])
    expect(r.mismatches).toEqual([])
    expect(r.picks).toHaveLength(2)
    expect(r.picks[0]).toMatchObject({ date: '2026-11-16', player: 'Yaxel Lendeborg', score: 36, x2: false })
    expect(r.picks[1]).toMatchObject({ date: '2026-10-20', player: 'Victor Wembanyama', score: 24, x2: true })
  })

  it('trie du plus récent au plus ancien', () => {
    const r = parseHistory('2026-10-20 A B 1 1 1 1 1 1 1 1 0 8 non\n2026-11-01 C D 1 1 1 1 1 1 1 1 0 8 non')
    expect(r.picks.map((p) => p.date)).toEqual(['2026-11-01', '2026-10-20'])
  })

  it('signale un score qui ne correspond pas à la formule TTFL', () => {
    const r = parseHistory('2026-11-16 Yaxel Lendeborg 28 8 3 1 2 8 9 2 25 99 non')
    expect(r.picks).toHaveLength(1)
    expect(r.mismatches).toHaveLength(1)
  })

  it('accepte un score négatif et un tableau sans colonne x2', () => {
    const r = parseHistory('2026-11-12 Ayo Dosunmu 2 1 0 0 0 0 1 0 12 -8')
    expect(r.mismatches).toEqual([])
    expect(r.picks[0]).toMatchObject({ score: -8, x2: false })
  })

  it('remonte les lignes qu’il ne comprend pas', () => {
    const r = parseHistory('n’importe quoi\n2026-11-16 Yaxel Lendeborg 28 8 3 1 2 8 9 2 25 36 non')
    expect(r.unknown).toEqual(['n’importe quoi'])
    expect(r.picks).toHaveLength(1)
  })

  it('garde les noms avec accents, tirets et apostrophes', () => {
    const r = parseHistory("2026-11-07 Nikola Jokić 19 13 8 1 1 4 7 1 16 38 non\n2026-11-08 De'Aaron Fox 1 1 1 1 1 1 1 1 0 8 non")
    expect(r.picks.map((p) => p.player).sort()).toEqual(["De'Aaron Fox", 'Nikola Jokić'])
  })
})
