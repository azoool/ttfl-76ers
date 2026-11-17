import type { Member, PickLite } from './availability'

const KEY = 'ttfl76.members.v1'

export function loadMembers(): Member[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Member[]) : []
  } catch {
    return []
  }
}

export function saveMembers(members: Member[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(members))
  } catch {
    // stockage indisponible (mode privé, quota) : les données restent en mémoire pour la session
  }
}

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Ajoute ou met à jour un membre (comparaison du pseudo sans tenir compte de la casse).
 * Les picks sont fusionnés par date ; les nouveaux remplacent les anciens.
 */
export function upsertMember(
  members: Member[],
  name: string,
  picks: PickLite[],
  now: Date = new Date(),
  makeId: () => string = newId,
): Member[] {
  const trimmed = name.trim()
  const existing = members.find((m) => m.name.toLowerCase() === trimmed.toLowerCase())
  const byDate = new Map<string, PickLite>((existing?.picks ?? []).map((p) => [p.date, p]))
  for (const p of picks) byDate.set(p.date, { date: p.date, player: p.player })
  const merged = [...byDate.values()].sort((a, b) => (a.date < b.date ? 1 : -1))
  const next: Member = {
    id: existing?.id ?? makeId(),
    name: existing?.name ?? trimmed,
    picks: merged,
    updatedAt: now.toISOString(),
  }
  return existing ? members.map((m) => (m.id === existing.id ? next : m)) : [...members, next]
}

export function removeMember(members: Member[], id: string): Member[] {
  return members.filter((m) => m.id !== id)
}
