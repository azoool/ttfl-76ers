import type { AvailabilityRow, Candidate } from './availability'
import { rankRows, type RankedRow } from './groups'
import type { StatsIndex } from './seasonStats'
import { playerKey } from './ttfl'

/** Joueur mis en favori : `key` l'identifie d'un jour à l'autre, `name` sert à l'afficher même s'il ne joue pas. */
export interface Favorite {
  key: string
  name: string
}

type PlayerId = Pick<Candidate, 'id' | 'name'>

/** Identifiant ESPN quand on l'a (stable même si le joueur change d'équipe), sinon le nom normalisé. */
export const favoriteKey = (c: PlayerId): string => (c.id ? `id:${c.id}` : `n:${playerKey(c.name)}`)

/** Ajoute le joueur aux favoris, ou l'en retire s'il y est déjà. */
export function toggleFavorite(list: Favorite[], c: PlayerId): Favorite[] {
  const key = favoriteKey(c)
  return list.some((f) => f.key === key) ? list.filter((f) => f.key !== key) : [...list, { key, name: c.name }]
}

export const removeFavorite = (list: Favorite[], key: string): Favorite[] => list.filter((f) => f.key !== key)

/** Relit les favoris enregistrés ; tout ce qui est illisible ou mal formé est ignoré. */
export function parseFavorites(raw: string | null): Favorite[] {
  if (!raw) return []
  try {
    const data: unknown = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    const seen = new Set<string>()
    const out: Favorite[] = []
    for (const f of data) {
      if (!f || typeof f.key !== 'string' || typeof f.name !== 'string' || seen.has(f.key)) continue
      seen.add(f.key)
      out.push({ key: f.key, name: f.name })
    }
    return out
  } catch {
    return []
  }
}

/** Favoris qui jouent ce jour-là (parmi les lignes affichées), classés comme les équipes : moyenne TTFL puis nom. */
export function favoriteRows(rows: AvailabilityRow[], keys: ReadonlySet<string>, stats?: StatsIndex): RankedRow[] {
  return rankRows(
    rows
      .filter((r) => keys.has(favoriteKey(r.candidate)))
      .map((row) => ({ row, stat: stats?.find(row.candidate.id, row.candidate.name) })),
  )
}

/**
 * Sépare des lignes déjà classées entre les joueurs disponibles pour tous les membres comptés et les autres
 * (le classement est conservé dans chaque groupe). Sans membre compté, rien n'est bloqué.
 */
export function splitByAvailability(rows: RankedRow[]): { free: RankedRow[]; blocked: RankedRow[] } {
  const free: RankedRow[] = []
  const blocked: RankedRow[] = []
  for (const r of rows) (r.row.total === 0 || r.row.freeCount === r.row.total ? free : blocked).push(r)
  return { free, blocked }
}

/** Favoris qui n'ont pas de match ce jour-là (aucun joueur correspondant parmi les équipes qui jouent). */
export function benchedFavorites(favorites: Favorite[], playing: Candidate[]): Favorite[] {
  const playingKeys = new Set(playing.map(favoriteKey))
  return favorites.filter((f) => !playingKeys.has(f.key))
}

const STORAGE_KEY = 'ttfl76.favorites.v1'

export function loadFavorites(): Favorite[] {
  try {
    return parseFavorites(localStorage.getItem(STORAGE_KEY))
  } catch {
    return [] // stockage indisponible (navigation privée, etc.)
  }
}

export function saveFavorites(list: Favorite[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // quota dépassé ou stockage bloqué : les favoris restent valables jusqu'à la fermeture de la page
  }
}
