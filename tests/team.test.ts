import { describe, expect, it } from 'vitest'
import { buildMembers, friendlyError, inviteUrl, normalizeCode, parseRoute } from '../src/lib/team'

describe('parseRoute', () => {
  it('lit les onglets', () => {
    expect(parseRoute('#/dispos')).toEqual({ tab: 'dispos' })
    expect(parseRoute('#/equipe')).toEqual({ tab: 'equipe' })
    expect(parseRoute('#/installer')).toEqual({ tab: 'installer' })
  })
  it('retombe sur Disponibles pour une adresse inconnue ou vide', () => {
    expect(parseRoute('')).toEqual({ tab: 'dispos' })
    expect(parseRoute('#/nimporte')).toEqual({ tab: 'dispos' })
  })
  it('ouvre l’onglet Équipe avec le code d’un lien d’invitation', () => {
    expect(parseRoute('#/join/abcd2345')).toEqual({ tab: 'equipe', joinCode: 'ABCD2345' })
    expect(parseRoute('#/join/ABCD2345/')).toEqual({ tab: 'equipe', joinCode: 'ABCD2345' })
    expect(parseRoute('#/join/')).toEqual({ tab: 'dispos' })
    expect(parseRoute('#/join/../../x')).toEqual({ tab: 'dispos' })
  })
})

describe('inviteUrl / normalizeCode', () => {
  it('remplace l’éventuel # courant par le lien d’invitation', () => {
    expect(inviteUrl('https://x.github.io/ttfl-76ers/#/equipe', 'ABCD2345')).toBe('https://x.github.io/ttfl-76ers/#/join/ABCD2345')
    expect(inviteUrl('https://x.github.io/ttfl-76ers/', 'ABCD2345')).toBe('https://x.github.io/ttfl-76ers/#/join/ABCD2345')
  })
  it('nettoie un code saisi à la main', () => {
    expect(normalizeCode(' abcd-2345 ')).toBe('ABCD2345')
  })
})

describe('buildMembers', () => {
  const members = [
    { id: 'm2', name: 'Zoé', user_id: 'u2' },
    { id: 'm1', name: 'Alice', user_id: 'u1' },
    { id: 'm3', name: 'Knicko', user_id: null },
  ]
  const picks = [
    { member_id: 'm1', date: '2026-11-10', player: 'A', updated_at: '2026-11-11T10:00:00Z' },
    { member_id: 'm1', date: '2026-11-12', player: 'B', updated_at: '2026-11-13T09:00:00Z' },
    { member_id: 'm3', date: '2026-11-01', player: 'C' },
  ]

  it('range les picks du plus récent au plus ancien et marque qui est moi', () => {
    const r = buildMembers(members, picks, 'm1')
    expect(r.map((m) => m.name)).toEqual(['Alice', 'Knicko', 'Zoé']) // moi d'abord, puis ordre alphabétique
    const alice = r[0]
    expect(alice.me).toBe(true)
    expect(alice.picks).toEqual([
      { date: '2026-11-12', player: 'B' },
      { date: '2026-11-10', player: 'A' },
    ])
    expect(alice.updatedAt).toBe('2026-11-13T09:00:00Z')
  })

  it('distingue les membres inscrits de ceux ajoutés par un coéquipier', () => {
    const r = buildMembers(members, picks, 'm1')
    expect(r.find((m) => m.name === 'Knicko')).toMatchObject({ claimed: false, me: false })
    expect(r.find((m) => m.name === 'Zoé')).toMatchObject({ claimed: true, picks: [] })
  })
})

describe('friendlyError', () => {
  it('traduit les erreurs réseau et de configuration', () => {
    expect(friendlyError(new TypeError('Failed to fetch'))).toMatch(/Pas de connexion/)
    expect(friendlyError({ message: 'Anonymous sign-ins are disabled' })).toMatch(/connexions anonymes/)
    expect(friendlyError(new Error('Invalid API key'))).toMatch(/clé Supabase/)
  })
  it('garde les messages du serveur, déjà en français', () => {
    expect(friendlyError({ message: "Code d'invitation inconnu", code: 'P0002' })).toBe("Code d'invitation inconnu")
  })
})
