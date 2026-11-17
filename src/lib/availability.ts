import { addDays, daysBetween } from './dates'
import { playerKey } from './ttfl'

/**
 * Règle TTFL : un joueur pické est indisponible pour les 30 jours suivants.
 * (Pris le 1er du mois, il est de nouveau disponible le 32.)
 * Hypothèse à confirmer sur le deck : les picks préparés à l'avance bloquent aussi le joueur
 * avant leur date, dans la même fenêtre de 30 jours.
 */
export const LOCK_DAYS = 30

export interface PickLite {
  date: string
  player: string
}

export interface Member {
  id: string
  name: string
  picks: PickLite[]
  /** ISO datetime du dernier import / relevé */
  updatedAt?: string
}

export type LockState = 'free' | 'locked' | 'picked'

export interface LockInfo {
  state: LockState
  /** Premier jour où le joueur redevient disponible (si `locked` à cause d'un pick passé). */
  freeOn?: string
  /** Jours restants avant de pouvoir le reprendre. */
  daysLeft?: number
  /** Pick à l'origine du verrou. */
  pickDate?: string
}

/** État d'un joueur pour un membre, le jour `target`. */
export function lockInfo(
  picks: PickLite[],
  playerName: string,
  target: string,
  lockDays: number = LOCK_DAYS,
): LockInfo {
  const key = playerKey(playerName)
  let latestPast: string | undefined
  let nearestFuture: string | undefined

  for (const p of picks) {
    if (playerKey(p.player) !== key) continue
    const gap = daysBetween(p.date, target) // > 0 : pick passé
    if (gap === 0) return { state: 'picked', pickDate: p.date }
    if (gap > 0 && gap <= lockDays) {
      if (!latestPast || p.date > latestPast) latestPast = p.date
    } else if (gap < 0 && -gap <= lockDays) {
      if (!nearestFuture || p.date < nearestFuture) nearestFuture = p.date
    }
  }

  if (latestPast) {
    const freeOn = addDays(latestPast, lockDays + 1)
    return { state: 'locked', freeOn, daysLeft: daysBetween(target, freeOn), pickDate: latestPast }
  }
  if (nearestFuture) {
    // Pick futur (préparé à l'avance) trop proche : reprendre ce joueur le bloquerait.
    return { state: 'locked', pickDate: nearestFuture, daysLeft: undefined }
  }
  return { state: 'free' }
}

export interface Candidate {
  name: string
  team: string
  teamId?: string
  position?: string
  injury?: { status: string; comment?: string }
}

export interface AvailabilityRow {
  candidate: Candidate
  perMember: Record<string, LockInfo>
  /** Nombre de membres (parmi ceux comptés) qui peuvent le prendre. */
  freeCount: number
  total: number
}

export function availabilityRows(
  members: Member[],
  candidates: Candidate[],
  target: string,
  lockDays: number = LOCK_DAYS,
): AvailabilityRow[] {
  return candidates
    .map((candidate) => {
      const perMember: Record<string, LockInfo> = {}
      let freeCount = 0
      for (const m of members) {
        const info = lockInfo(m.picks, candidate.name, target, lockDays)
        perMember[m.id] = info
        if (info.state === 'free') freeCount++
      }
      return { candidate, perMember, freeCount, total: members.length }
    })
    .sort((a, b) => b.freeCount - a.freeCount || a.candidate.name.localeCompare(b.candidate.name, 'fr'))
}
