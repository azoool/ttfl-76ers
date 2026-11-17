import { ttflScore, type BoxStats } from './ttfl'

export interface Pick {
  /** Jour du deck, YYYY-MM-DD */
  date: string
  player: string
  score: number
  x2: boolean
  stats?: BoxStats
}

export interface ParseResult {
  picks: Pick[]
  /** Lignes reconnues dont le score recalculé diffère de celui collé (donnée suspecte). */
  mismatches: string[]
  /** Lignes non reconnues, hors en-têtes, pieds de tableau et pagination habituels. */
  unknown: string[]
}

const NUM = String.raw`(-?\d+)`
const SEP = String.raw`[\t ]+`
// Date | Joueur | Pts Reb Ast Stl Blk Ftm Fgm Fg3m Malus Score | [Bonus x2]
const ROW = new RegExp(
  String.raw`^(\d{4}-\d{2}-\d{2})${SEP}(.+?)${SEP}` +
    Array(10).fill(NUM).join(SEP) +
    String.raw`(?:${SEP}(\S+))?$`,
)

// Lignes que le tableau de TTFL ajoute autour des données (en-tête répété, pagination, recherche…).
const NOISE = /^(date\b|afficher\b|\d+\s*$|lignes\b|rechercher|page\s+\d+|pr[ée]c[ée]dent|suivant|historique des decks|tout le d[ée]tail)/i

function isYes(v: string | undefined): boolean {
  return v !== undefined && /^(oui|yes|x2|true|1)$/i.test(v)
}

/**
 * Lit le tableau "Historique des decks" de TTFL (?tpl=historique) copié-collé depuis le navigateur.
 * Accepte les colonnes séparées par des tabulations (copie d'un tableau) ou par des espaces.
 */
export function parseHistory(text: string): ParseResult {
  const picks = new Map<string, Pick>()
  const mismatches: string[] = []
  const unknown: string[] = []

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const m = ROW.exec(line)
    if (!m) {
      if (!NOISE.test(line)) unknown.push(line)
      continue
    }
    const [pts, reb, ast, stl, blk, ftm, fgm, fg3m, malus, score] = m.slice(3, 13).map(Number)
    const stats: BoxStats = { pts, reb, ast, stl, blk, ftm, fgm, fg3m, malus }
    if (ttflScore(stats) !== score) mismatches.push(line)
    picks.set(m[1], { date: m[1], player: m[2].trim(), score, x2: isYes(m[13]), stats })
  }

  const sorted = [...picks.values()].sort((a, b) => (a.date < b.date ? 1 : -1))
  return { picks: sorted, mismatches, unknown }
}
