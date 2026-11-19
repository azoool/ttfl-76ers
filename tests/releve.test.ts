// Fonctions de lecture du script de relevé (public/ttfl-releve.user.js) : le script est un fichier unique, sans étape de
// build ; chargé depuis Node, il expose ses fonctions pures au lieu de s'exécuter dans un navigateur.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

interface Pick {
  date: string
  player: string
  score: number | null
  x2: boolean
}
interface Releve {
  toIsoDate(s: string): string | null
  parsePicksTable(rows: string[][]): Pick[]
  parseTeamMembers(links: Array<{ name: string; href: string }>): Array<{ id: string; name: string }>
  parseOwnName(headings: string[]): string | null
  buildPayload(me: { name: string; picks: Pick[] }, others: Array<{ name: string; picks: Pick[] }>): Array<{ name: string; picks: Pick[] }>
  todayParis(now?: Date): string
}
// Le script est évalué avec un objet `module` : il y dépose ses fonctions au lieu de démarrer (comme dans un navigateur
// il détecte l'absence de `module`). Indépendant du « type: module » du projet.
const loaded: { exports: unknown } = { exports: {} }
new Function('module', readFileSync(new URL('../public/ttfl-releve.user.js', import.meta.url), 'utf8'))(loaded)
const releve = loaded.exports as Releve

describe('toIsoDate', () => {
  it('accepte la date d’un profil (JJ-MM-AAAA) comme celle de l’historique (AAAA-MM-JJ)', () => {
    expect(releve.toIsoDate('18-11-2026')).toBe('2026-11-18')
    expect(releve.toIsoDate('2026-11-18')).toBe('2026-11-18')
    expect(releve.toIsoDate(' 07/11/2026 ')).toBe('2026-11-07')
  })
  it('refuse ce qui n’est pas une date', () => {
    expect(releve.toIsoDate('')).toBeNull()
    expect(releve.toIsoDate('hier')).toBeNull()
    expect(releve.toIsoDate('18-11-26')).toBeNull()
  })
})

describe('parsePicksTable', () => {
  it('lit le tableau « 5 derniers picks » d’un profil', () => {
    const rows = [
      ['Date', 'Joueur', 'TTFL', 'x2'],
      ['18-11-2026', 'Joel Embiid', '46', ''],
      ['17-11-2026', 'Scottie Barnes', '32', 'x2'],
      ['16-11-2026', 'Yaxel Lendeborg', '36', ''],
    ]
    expect(releve.parsePicksTable(rows)).toEqual([
      { date: '2026-11-18', player: 'Joel Embiid', score: 46, x2: false },
      { date: '2026-11-17', player: 'Scottie Barnes', score: 32, x2: true },
      { date: '2026-11-16', player: 'Yaxel Lendeborg', score: 36, x2: false },
    ])
  })

  it('lit l’historique complet en repérant les colonnes par leur titre', () => {
    const rows = [
      ['Date', 'Joueur', 'Pts', 'Reb', 'Ast', 'Stl', 'Blk', 'Ftm', 'Fgm', 'Fg3m', 'Malus', 'Score', 'Bonus x2'],
      ['2026-11-18', 'Joel Embiid', '26', '8', '3', '1', '1', '6', '9', '2', '10', '46', 'non'],
      ['2026-10-20', 'Victor Wembanyama', '12', '13', '3', '1', '6', '10', '1', '0', '22', '24', 'oui'],
    ]
    expect(releve.parsePicksTable(rows)).toEqual([
      { date: '2026-11-18', player: 'Joel Embiid', score: 46, x2: false },
      { date: '2026-10-20', player: 'Victor Wembanyama', score: 24, x2: true },
    ])
  })

  it('tolère un ordre de colonnes différent et un score négatif', () => {
    const rows = [
      ['Joueur', 'TTFL', 'Date'],
      ['Dean Wade', '-3', '15-11-2026'],
    ]
    expect(releve.parsePicksTable(rows)).toEqual([{ date: '2026-11-15', player: 'Dean Wade', score: -3, x2: false }])
  })

  it('ignore les lignes sans date ou sans joueur, et un tableau sans les bonnes colonnes', () => {
    expect(
      releve.parsePicksTable([
        ['Date', 'Joueur', 'TTFL', 'x2'],
        ['', 'Sans date', '10', ''],
        ['18-11-2026', '', '10', ''],
        ['18-11-2026', 'Valide', '10', ''],
      ]),
    ).toHaveLength(1)
    expect(releve.parsePicksTable([['Rang', 'Nom'], ['1', 'x']])).toEqual([])
    expect(releve.parsePicksTable([])).toEqual([])
  })
})

describe('parseTeamMembers', () => {
  it('extrait pseudo et identifiant de profil, sans doublon (la page liste l’équipe dans plusieurs classements)', () => {
    const links = [
      { name: ' Alice ', href: '/?tpl=halloffame&ttpl=111' },
      { name: 'Bob  Marley', href: '/?tpl=halloffame&ttpl=222' },
      { name: 'Alice', href: '/?tpl=halloffame&ttpl=111' },
      { name: 'Sans profil', href: '/?tpl=team' },
    ]
    expect(releve.parseTeamMembers(links)).toEqual([
      { id: '111', name: 'Alice' },
      { id: '222', name: 'Bob Marley' },
    ])
  })
})

describe('parseOwnName', () => {
  it('lit le pseudo qui suit « Fiche joueur »', () => {
    expect(releve.parseOwnName(['Fiche joueur', '  Alice ', 'Autre titre'])).toBe('Alice')
    expect(releve.parseOwnName(['Autre titre'])).toBeNull()
    expect(releve.parseOwnName(['Fiche joueur'])).toBeNull()
  })
})

describe('buildPayload', () => {
  it('met d’abord ma personne, puis les coéquipiers, un pseudo une seule fois (casse ignorée)', () => {
    const p = (player: string): Pick[] => [{ date: '2026-11-18', player, score: 1, x2: false }]
    const out = releve.buildPayload({ name: 'Alice', picks: p('A') }, [
      { name: 'Bob', picks: p('B') },
      { name: 'alice', picks: p('doublon') },
      { name: 'Carl', picks: p('C') },
    ])
    expect(out.map((m) => m.name)).toEqual(['Alice', 'Bob', 'Carl'])
    expect(out[0].picks[0].player).toBe('A')
  })
})

describe('todayParis', () => {
  it('donne la date du jour à Paris, pas celle d’UTC', () => {
    expect(releve.todayParis(new Date('2026-11-18T23:30:00Z'))).toBe('2026-11-19')
    expect(releve.todayParis(new Date('2026-11-18T12:00:00Z'))).toBe('2026-11-18')
  })
})
