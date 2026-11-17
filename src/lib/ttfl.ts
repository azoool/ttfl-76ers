// Règles de calcul TTFL (voir la FAQ du jeu : "Calcul des points").

export interface BoxStats {
  pts: number
  reb: number
  ast: number
  stl: number
  blk: number
  /** lancers francs réussis */
  ftm: number
  /** tirs réussis (3 pts inclus) */
  fgm: number
  /** 3 pts réussis */
  fg3m: number
  /** balles perdues + tirs ratés + 3 pts ratés + lancers francs ratés */
  malus: number
}

/** Score TTFL = (PTS+REB+AST+STL+BLK+tirs réussis+3pts réussis+LF réussis) − malus. */
export function ttflScore(s: BoxStats): number {
  return s.pts + s.reb + s.ast + s.stl + s.blk + s.ftm + s.fgm + s.fg3m - s.malus
}

export interface RawBox {
  tov: number
  fgm: number
  fga: number
  fg3m: number
  fg3a: number
  ftm: number
  fta: number
}

/** Malus TTFL à partir d'un box score brut (ex. données ESPN). */
export function malusFromBox(b: RawBox): number {
  return b.tov + (b.fga - b.fgm) + (b.fg3a - b.fg3m) + (b.fta - b.ftm)
}

const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v'])

/**
 * Clé de comparaison d'un nom de joueur : "Luka Dončić" (TTFL) et "Luka Doncic" (ESPN)
 * donnent la même clé. Accents, ponctuation, majuscules et suffixes (Jr., III…) sont ignorés.
 */
export function playerKey(name: string): string {
  const words = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.'’`]/g, '')
    .replace(/[-–]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  while (words.length > 1 && SUFFIXES.has(words[words.length - 1])) words.pop()
  return words.join(' ')
}
