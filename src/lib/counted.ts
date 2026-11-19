// « Profil » de la personne : quels membres de l'équipe comptent dans la disponibilité des joueurs.
// Par défaut, seulement soi (c'est son propre deck qu'on prépare) ; le choix est mémorisé sur l'appareil.

export interface Countable {
  id: string
  /** c'est la personne qui utilise l'appareil */
  me?: boolean
}

/** `scope` (équipe + identité sur l'appareil, ou « local ») → identifiants des membres comptés. */
export type CountedStore = Record<string, string[]>

const STORAGE_KEY = 'ttfl76.counted.v1'

/** Par défaut : soi seul quand on sait qui on est, sinon tout le monde (historiques importés sur l'appareil). */
export function defaultCounted(members: Countable[]): string[] {
  const me = members.find((m) => m.me)
  return me ? [me.id] : members.map((m) => m.id)
}

/**
 * Membres comptés : le choix mémorisé s'il existe, limité aux membres qui existent encore ;
 * sinon le défaut. Une sélection mémorisée dont plus aucun membre n'existe (membre supprimé)
 * retombe sur le défaut plutôt que de masquer toutes les disponibilités ; une sélection
 * volontairement vide reste vide.
 */
export function resolveCounted(members: Countable[], stored?: string[]): Set<string> {
  if (stored === undefined) return new Set(defaultCounted(members))
  if (stored.length === 0) return new Set()
  const exist = new Set(members.map((m) => m.id))
  const kept = stored.filter((id) => exist.has(id))
  return new Set(kept.length > 0 ? kept : defaultCounted(members))
}

/** Relit le stockage ; tout ce qui est illisible ou mal formé est ignoré. */
export function parseCounted(raw: string | null): CountedStore {
  if (!raw) return {}
  try {
    const data: unknown = JSON.parse(raw)
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {}
    const out: CountedStore = {}
    for (const [scope, ids] of Object.entries(data)) {
      if (Array.isArray(ids) && ids.every((id) => typeof id === 'string')) out[scope] = ids
    }
    return out
  } catch {
    return {}
  }
}

function readStore(): CountedStore {
  try {
    return parseCounted(localStorage.getItem(STORAGE_KEY))
  } catch {
    return {} // stockage indisponible (navigation privée, etc.)
  }
}

export const loadCounted = (scope: string): string[] | undefined => readStore()[scope]

export function saveCounted(scope: string, ids: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readStore(), [scope]: ids }))
  } catch {
    // quota dépassé ou stockage bloqué : le choix reste valable jusqu'à la fermeture de la page
  }
}
