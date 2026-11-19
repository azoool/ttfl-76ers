// Vérifie le schéma Supabase (supabase/schema.sql) sur un vrai PostgreSQL (PGlite, en mémoire),
// avec les rôles et auth.uid() de Supabase simulés : mêmes règles de sécurité que la production.
import { PGlite } from '@electric-sql/pglite'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'

const SCHEMA = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8')

// Ce que Supabase fournit déjà en production.
const SUPABASE_STUBS = `
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin;
  create role authenticated nologin;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
`

let db: PGlite

/** Un nouvel appareil (= une connexion anonyme Supabase). */
async function newUser(): Promise<string> {
  const id = randomUUID()
  await db.exec(`insert into auth.users (id) values ('${id}')`)
  return id
}

/** Exécute `fn` en se faisant passer pour l'utilisateur `uid` (null = visiteur non connecté). */
async function as<T>(uid: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(
    `reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false); set role ${uid ? 'authenticated' : 'anon'};`,
  )
  try {
    return await fn()
  } finally {
    await db.exec('reset role')
  }
}

const rows = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await db.query<T>(sql, params)).rows

interface Created {
  out_team_id: string
  out_invite_code: string
  out_member_id: string
}
const createTeam = (uid: string, team = 'Équipe test', me = 'Alice') =>
  as(uid, async () => (await rows<Created>('select * from public.create_team($1, $2)', [team, me]))[0])

const joinTeam = (uid: string, code: string, me: string) =>
  as(uid, async () =>
    (
      await rows<{ out_team_id: string; out_member_id: string; out_team_name: string }>(
        'select * from public.join_team($1, $2)',
        [code, me],
      )
    )[0],
  )

const addMember = (uid: string, team: string, name: string) =>
  as(uid, async () => (await rows<{ add_member: string }>('select public.add_member($1, $2)', [team, name]))[0].add_member)

const insertPick = (uid: string, member: string, date: string, player: string) =>
  as(uid, () => rows('insert into public.picks (member_id, date, player) values ($1, $2, $3)', [member, date, player]))

beforeAll(async () => {
  db = new PGlite()
  await db.exec(SUPABASE_STUBS)
  await db.exec(SCHEMA)
})

describe('schéma Supabase', () => {
  it('peut être exécuté deux fois sans erreur', async () => {
    await expect(db.exec(SCHEMA)).resolves.toBeDefined()
  })

  it('refuse tout à un visiteur non connecté (rôle anon)', async () => {
    await expect(as(null, () => rows('select * from public.teams'))).rejects.toThrow(/permission denied/)
    await expect(as(null, () => rows('select * from public.members'))).rejects.toThrow(/permission denied/)
    await expect(as(null, () => rows('select * from public.picks'))).rejects.toThrow(/permission denied/)
    await expect(as(null, () => rows("select * from public.create_team('x', 'y')"))).rejects.toThrow(/permission denied/)
    await expect(as(null, () => rows("select * from public.join_team('ABCDEFGH', 'y')"))).rejects.toThrow(/permission denied/)
    await expect(as(null, () => rows("select public.preview_team('ABCDEFGH')"))).rejects.toThrow(/permission denied/)
  })

  it('interdit d’écrire directement dans teams et members', async () => {
    const a = await newUser()
    await expect(
      as(a, () => rows("insert into public.teams (name, invite_code) values ('x', 'ABCDEFGH')")),
    ).rejects.toThrow(/permission denied/)
    await expect(
      as(a, () => rows("insert into public.members (team_id, name) values (gen_random_uuid(), 'x')")),
    ).rejects.toThrow(/permission denied/)
    await expect(as(a, () => rows('select public.gen_invite_code()'))).rejects.toThrow(/permission denied/)
  })

  it('crée une équipe avec un code de 8 caractères lisibles et un premier membre', async () => {
    const a = await newUser()
    const t = await createTeam(a)
    expect(t.out_invite_code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/)
    const members = await as(a, () =>
      rows<{ name: string; user_id: string }>('select name, user_id from public.members where team_id = $1', [t.out_team_id]),
    )
    expect(members).toEqual([{ name: 'Alice', user_id: a }])
  })

  it('génère des codes différents', async () => {
    const codes = new Set<string>()
    for (let i = 0; i < 25; i++) codes.add((await rows<{ c: string }>('select public.gen_invite_code() as c'))[0].c)
    expect(codes.size).toBe(25)
  })

  it('cache l’équipe, ses membres et ses picks à quelqu’un qui n’en fait pas partie', async () => {
    const [a, b] = [await newUser(), await newUser()]
    const t = await createTeam(a)
    await insertPick(a, t.out_member_id, '2026-11-10', 'Jalen Brunson')
    await as(b, async () => {
      expect(await rows('select * from public.teams where id = $1', [t.out_team_id])).toEqual([])
      expect(await rows('select * from public.members where team_id = $1', [t.out_team_id])).toEqual([])
      expect(await rows('select * from public.picks where member_id = $1', [t.out_member_id])).toEqual([])
      await expect(
        rows("insert into public.picks (member_id, date, player) values ($1, '2026-11-11', 'X')", [t.out_member_id]),
      ).rejects.toThrow(/row-level security/)
      await expect(rows('select public.add_member($1, $2)', [t.out_team_id, 'Intrus'])).rejects.toThrow(/Accès refusé/)
      await expect(rows('select public.rotate_invite_code($1)', [t.out_team_id])).rejects.toThrow(/Accès refusé/)
    })
  })

  it('refuse un code inconnu et accepte le bon code même mal écrit', async () => {
    const [a, b] = [await newUser(), await newUser()]
    const t = await createTeam(a)
    await expect(joinTeam(b, 'AAAAAAAA', 'Bob')).rejects.toThrow(/Code d'invitation inconnu/)
    const joined = await joinTeam(b, `  ${t.out_invite_code.toLowerCase()} `, 'Bob')
    expect(joined.out_team_id).toBe(t.out_team_id)
    expect(joined.out_team_name).toBe('Équipe test')
  })

  it('laisse les coéquipiers lire et écrire les picks de l’équipe, pas ceux d’une autre', async () => {
    const [a, b, c] = [await newUser(), await newUser(), await newUser()]
    const t1 = await createTeam(a, 'Équipe 1', 'Alice')
    const t2 = await createTeam(c, 'Équipe 2', 'Carl')
    await joinTeam(b, t1.out_invite_code, 'Bob')

    // Bob écrit un pick pour Alice (le relevé enregistre l'équipe entière), puis le corrige
    await as(b, async () => {
      const sql = `insert into public.picks (member_id, date, player, score, source) values ($1, '2026-11-12', $2, $3, 'releve')
                   on conflict (member_id, date) do update set player = excluded.player, score = excluded.score`
      await rows(sql, [t1.out_member_id, 'Jalen Brunson', 39])
      await rows(sql, [t1.out_member_id, 'Jalen Brunson', 40])
    })
    const seenByAlice = await as(a, () =>
      rows<{ player: string; score: number }>('select player, score from public.picks where member_id = $1', [t1.out_member_id]),
    )
    expect(seenByAlice).toEqual([{ player: 'Jalen Brunson', score: 40 }])

    // Carl (autre équipe) ne voit rien, et Bob ne peut pas déplacer un pick vers l'équipe de Carl
    expect(await as(c, () => rows('select * from public.picks where member_id = $1', [t1.out_member_id]))).toEqual([])
    await expect(
      as(b, () =>
        rows("update public.picks set member_id = $1 where member_id = $2 and date = '2026-11-12'", [t2.out_member_id, t1.out_member_id]),
      ),
    ).rejects.toThrow(/row-level security/)
  })

  it('met à jour updated_at quand un pick est modifié', async () => {
    const a = await newUser()
    const t = await createTeam(a)
    await insertPick(a, t.out_member_id, '2026-11-01', 'A')
    await db.exec("update public.picks set updated_at = '2020-01-01'")
    await as(a, () => rows("update public.picks set player = 'B' where member_id = $1", [t.out_member_id]))
    const [{ fresh }] = await rows<{ fresh: boolean }>(
      "select updated_at > now() - interval '1 minute' as fresh from public.picks where member_id = $1",
      [t.out_member_id],
    )
    expect(fresh).toBe(true)
  })

  it('permet d’ajouter un coéquipier pas encore inscrit, qui le reprend en rejoignant avec son pseudo', async () => {
    const [a, d] = [await newUser(), await newUser()]
    const t = await createTeam(a)
    const added = await addMember(a, t.out_team_id, 'Knicko')
    await insertPick(a, added, '2026-11-05', 'Jaylen Brown')
    // ajouter deux fois le même pseudo (casse différente) ne crée pas de doublon
    expect(await addMember(a, t.out_team_id, 'KNICKO')).toBe(added)

    const claimed = await joinTeam(d, t.out_invite_code, 'knicko')
    expect(claimed.out_member_id).toBe(added)
    const picks = await as(d, () => rows<{ player: string }>('select player from public.picks where member_id = $1', [added]))
    expect(picks).toEqual([{ player: 'Jaylen Brown' }])
  })

  it('est idempotent : rejoindre deux fois renvoie le même membre', async () => {
    const [a, b] = [await newUser(), await newUser()]
    const t = await createTeam(a)
    const first = await joinTeam(b, t.out_invite_code, 'Bob')
    const second = await joinTeam(b, t.out_invite_code, 'Autre pseudo')
    expect(second.out_member_id).toBe(first.out_member_id)
  })

  it('plafonne une équipe à 12 membres', async () => {
    const [a, b] = [await newUser(), await newUser()]
    const t = await createTeam(a)
    for (let i = 1; i <= 11; i++) await addMember(a, t.out_team_id, `Joueur ${i}`)
    await expect(addMember(a, t.out_team_id, 'Le 13e')).rejects.toThrow(/Équipe complète/)
    await expect(joinTeam(b, t.out_invite_code, 'Trop tard')).rejects.toThrow(/Équipe complète/)
  })

  it('limite le nombre d’équipes créées par appareil', async () => {
    const e = await newUser()
    for (let i = 0; i < 5; i++) await createTeam(e, `Équipe ${i}`, 'Eve')
    await expect(createTeam(e, 'Une de trop', 'Eve')).rejects.toThrow(/Trop d'équipes/)
  })

  it('valide les noms', async () => {
    const a = await newUser()
    await expect(createTeam(a, '   ', 'Alice')).rejects.toThrow(/Nom d'équipe invalide/)
    await expect(createTeam(a, 'OK', '')).rejects.toThrow(/Pseudo invalide/)
    await expect(createTeam(a, 'x'.repeat(61), 'Alice')).rejects.toThrow(/Nom d'équipe invalide/)
  })

  it('quitter garde les picks partagés mais coupe l’accès ; quitter avec suppression efface tout', async () => {
    const [a, b] = [await newUser(), await newUser()]
    const t = await createTeam(a)
    const bob = await joinTeam(b, t.out_invite_code, 'Bob')
    await insertPick(b, bob.out_member_id, '2026-11-02', 'X')

    await as(b, () => rows('select public.leave_team($1)', [t.out_team_id]))
    expect(await as(b, () => rows('select * from public.members where team_id = $1', [t.out_team_id]))).toEqual([])
    const kept = await as(a, () => rows<{ user_id: string | null }>('select user_id from public.members where id = $1', [bob.out_member_id]))
    expect(kept).toEqual([{ user_id: null }])
    expect(await as(a, () => rows('select * from public.picks where member_id = $1', [bob.out_member_id]))).toHaveLength(1)

    // Bob revient puis part en demandant la suppression de ses données
    await joinTeam(b, t.out_invite_code, 'Bob')
    await as(b, () => rows('select public.leave_team($1, true)', [t.out_team_id]))
    expect(await as(a, () => rows('select * from public.members where id = $1', [bob.out_member_id]))).toEqual([])
    expect(await as(a, () => rows('select * from public.picks where member_id = $1', [bob.out_member_id]))).toEqual([])
  })

  describe('aperçu d’une équipe avant de la rejoindre (preview_team)', () => {
    interface Preview {
      team_name: string
      members: { name: string; claimed: boolean }[]
    }
    const preview = (uid: string, code: string) =>
      as(uid, async () => (await rows<{ preview_team: Preview }>('select public.preview_team($1)', [code]))[0].preview_team)

    it('montre à quelqu’un qui a le code le nom de l’équipe et ses membres, rangés par ordre alphabétique', async () => {
      const [a, visitor] = [await newUser(), await newUser()]
      const t = await createTeam(a, 'Les 76ers', 'Zoé')
      await addMember(a, t.out_team_id, 'alex')
      await addMember(a, t.out_team_id, 'Bastien')
      const p = await preview(visitor, t.out_invite_code)
      expect(p.team_name).toBe('Les 76ers')
      expect(p.members.map((m) => m.name)).toEqual(['alex', 'Bastien', 'Zoé'])
    })

    it('indique quels membres sont déjà liés à un appareil', async () => {
      const [a, visitor] = [await newUser(), await newUser()]
      const t = await createTeam(a, 'Équipe', 'Alice')
      await addMember(a, t.out_team_id, 'Bob') // ajouté par un coéquipier : pas encore lié
      const p = await preview(visitor, t.out_invite_code)
      expect(p.members).toEqual([
        { name: 'Alice', claimed: true },
        { name: 'Bob', claimed: false },
      ])
    })

    it('ne révèle aucun pick et n’ouvre aucun accès aux tables', async () => {
      const [a, visitor] = [await newUser(), await newUser()]
      const t = await createTeam(a)
      await insertPick(a, t.out_member_id, '2026-11-10', 'Jalen Brunson')
      const p = await preview(visitor, t.out_invite_code)
      expect(JSON.stringify(p)).not.toMatch(/Brunson|2026-11-10/)
      await as(visitor, async () => {
        expect(await rows('select * from public.members where team_id = $1', [t.out_team_id])).toEqual([])
        expect(await rows('select * from public.picks where member_id = $1', [t.out_member_id])).toEqual([])
      })
    })

    it('accepte le code en minuscules et refuse un code inconnu', async () => {
      const [a, visitor] = [await newUser(), await newUser()]
      const t = await createTeam(a, 'Équipe', 'Alice')
      expect((await preview(visitor, ` ${t.out_invite_code.toLowerCase()} `)).team_name).toBe('Équipe')
      await expect(preview(visitor, 'AAAAAAAA')).rejects.toThrow(/Code d'invitation inconnu/)
    })

    it('ne montre que les membres de l’équipe du code, pas ceux d’une autre', async () => {
      const [a, c, visitor] = [await newUser(), await newUser(), await newUser()]
      const t1 = await createTeam(a, 'Équipe 1', 'Alice')
      await createTeam(c, 'Équipe 2', 'Carl')
      expect((await preview(visitor, t1.out_invite_code)).members.map((m) => m.name)).toEqual(['Alice'])
    })

    it('choisir un membre de la liste revient à rejoindre avec son pseudo (membre repris, picks conservés)', async () => {
      const [a, visitor] = [await newUser(), await newUser()]
      const t = await createTeam(a, 'Équipe', 'Alice')
      const bob = await addMember(a, t.out_team_id, 'Bob')
      await insertPick(a, bob, '2026-11-05', 'Jaylen Brown')
      const chosen = (await preview(visitor, t.out_invite_code)).members.find((m) => !m.claimed)!
      const joined = await joinTeam(visitor, t.out_invite_code, chosen.name)
      expect(joined.out_member_id).toBe(bob)
      expect(await as(visitor, () => rows('select player from public.picks where member_id = $1', [bob]))).toEqual([
        { player: 'Jaylen Brown' },
      ])
    })
  })

  it('change le code d’invitation : l’ancien ne marche plus', async () => {
    const [a, b] = [await newUser(), await newUser()]
    const t = await createTeam(a)
    const next = await as(a, async () =>
      (await rows<{ rotate_invite_code: string }>('select public.rotate_invite_code($1)', [t.out_team_id]))[0].rotate_invite_code,
    )
    expect(next).not.toBe(t.out_invite_code)
    await expect(joinTeam(b, t.out_invite_code, 'Bob')).rejects.toThrow(/Code d'invitation inconnu/)
    await expect(joinTeam(b, next, 'Bob')).resolves.toBeDefined()
  })
})
