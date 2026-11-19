import { describe, expect, it } from 'vitest'
import {
  buildMembers,
  classifyPreviewError,
  friendlyError,
  inviteUrl,
  normalizeCode,
  parseNames,
  parseRoute,
  splitPreviewMembers,
} from '../src/lib/team'

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

describe('splitPreviewMembers', () => {
  it('sépare les membres pas encore inscrits de ceux déjà liés à un appareil, chacun par ordre alphabétique', () => {
    const members = [
      { name: 'Zoé', claimed: true },
      { name: 'émilie', claimed: false },
      { name: 'Bastien', claimed: false },
      { name: 'alex', claimed: true },
    ]
    expect(splitPreviewMembers(members)).toEqual({ fresh: ['Bastien', 'émilie'], claimed: ['alex', 'Zoé'] })
  })

  it('gère une équipe vide', () => {
    expect(splitPreviewMembers([])).toEqual({ fresh: [], claimed: [] })
  })
})

describe('classifyPreviewError', () => {
  it('reconnaît un code d’invitation inconnu', () => {
    expect(classifyPreviewError({ code: 'P0002', message: 'Code d\'invitation inconnu' })).toBe('unknown-code')
    expect(classifyPreviewError(new Error('Code d\'invitation inconnu'))).toBe('unknown-code')
  })

  it('reconnaît une fonction d’aperçu pas encore installée dans Supabase', () => {
    expect(
      classifyPreviewError({ code: 'PGRST202', message: 'Could not find the function public.preview_team(p_code) in the schema cache' }),
    ).toBe('unavailable')
  })

  it('classe le reste (réseau, serveur…) à part', () => {
    expect(classifyPreviewError(new TypeError('Failed to fetch'))).toBe('other')
    expect(classifyPreviewError({ code: '500', message: 'boom' })).toBe('other')
  })
})

describe('parseNames', () => {
  it('sépare les pseudos par ligne, virgule ou point-virgule et nettoie les espaces', () => {
    expect(parseNames('Alice\n  Bob  \r\nCarl, Dana;Eve')).toEqual(['Alice', 'Bob', 'Carl', 'Dana', 'Eve'])
    expect(parseNames('Jean  Pierre')).toEqual(['Jean Pierre'])
  })

  it('ignore les lignes vides et les doublons (casse ignorée), en gardant la première écriture', () => {
    expect(parseNames('\n\nKnicko\nknicko\n  \nKNICKO ,Bob')).toEqual(['Knicko', 'Bob'])
    expect(parseNames('')).toEqual([])
  })

  it('garde les chiffres et la casse des pseudos TTFL', () => {
    expect(parseNames('Anfieldsharks1403\nHugues98\nJMdu31')).toEqual(['Anfieldsharks1403', 'Hugues98', 'JMdu31'])
  })
})
