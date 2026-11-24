// Version téléphone du relevé (public/releve-termux.mjs) : toute la logique est testée contre un faux TTFL
// (reconnexion par cookies, redirections, pages aux noms fictifs) et un faux Supabase, sans réseau ni téléphone.
import { describe, expect, it } from 'vitest'
// @ts-expect-error TS7016 : fichier JavaScript sans déclaration de types
import * as termux from '../public/releve-termux.mjs'

const { collect, createJar, daysLeft, explain, loadParsers, makeNotifier, parisParts, runOnce, send, shouldRun, ttflFetch } = termux
const parsers = loadParsers()
const instant = async () => {}
const COOKIES = { TTFLmail: 'MAIL-SECRET', TTFLhash: 'HASH-SECRET' }
const TOKEN = 'GOOD-TOKEN-SECRET'

// ───────────────────────── Faux TTFL ─────────────────────────

const member = (id: number, name: string) =>
  `<li class="member-item ranking-item"><span class="rk-name"><a href="/?tpl=halloffame&amp;ttpl=${id}"> ${name} </a></span></li>`
// la page équipe liste les membres dans plusieurs classements : chacun apparaît plusieurs fois
const TEAM = `<ul>${[111, 222, 333].map((id, i) => member(id, ['Alice', 'Bob', 'Carl'][i])).join('')}</ul><ul>${[222, 111, 333].map((id) => member(id, { 111: 'Alice', 222: 'Bob', 333: 'Carl' }[id]!)).join('')}</ul>`
const OWN = '<h1>Fiche joueur</h1><h2>Alice</h2>'
const profile = (rows: string[][]) =>
  `<table><tr><th>Date</th><th>Joueur</th><th>TTFL</th><th>x2</th></tr>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>`
const HISTORY = `<table>
  <tr><th>Date</th><th>Joueur</th><th>Pts</th><th>Reb</th><th>Ast</th><th>Stl</th><th>Blk</th><th>Ftm</th><th>Fgm</th><th>Fg3m</th><th>Malus</th><th>Score</th><th>Bonus x2</th></tr>
  <tr><td>Date</td><td>Joueur</td><td>Pts</td><td>Reb</td><td>Ast</td><td>Stl</td><td>Blk</td><td>Ftm</td><td>Fgm</td><td>Fg3m</td><td>Malus</td><td>Score</td></tr>
  <tr><td>2026-11-18</td><td>Jalen Brunson</td><td>28</td><td>3</td><td>6</td><td>1</td><td>0</td><td>5</td><td>10</td><td>2</td><td>12</td><td>43</td><td>non</td></tr>
  <tr><td>2026-11-17</td><td>Victor Wembanyama</td><td>30</td><td>12</td><td>3</td><td>1</td><td>4</td><td>6</td><td>11</td><td>3</td><td>14</td><td>56</td><td>oui</td></tr>
</table>`
const PROFILES: Record<string, string> = {
  '222': profile([
    ['18-11-2026', 'Joel Embiid', '46', ''],
    ['17-11-2026', 'Scottie Barnes', '32', 'x2'],
  ]),
  '333': profile([['18-11-2026', 'Tyrese Maxey', '40', '']]),
}

function fakeTtfl({ rememberOk = true, renew = false }: { rememberOk?: boolean; renew?: boolean } = {}) {
  const sessions = new Set<string>()
  const requested: string[] = []
  let counter = 0
  const fetchImpl = async (input: string, init: { headers: Record<string, string> }) => {
    const url = new URL(input)
    requested.push(url.pathname + url.search)
    const cookies = Object.fromEntries(
      (init.headers.Cookie ?? '').split('; ').filter(Boolean).map((c) => [c.slice(0, c.indexOf('=')), c.slice(c.indexOf('=') + 1)]),
    )
    const redirect = (to: string, setCookies: string[]) => {
      const headers = new Headers({ Location: to })
      setCookies.forEach((c) => headers.append('Set-Cookie', c))
      return new Response(null, { status: 302, headers })
    }
    if (url.pathname.endsWith('/login.php')) {
      if (rememberOk && cookies.TTFLmail === COOKIES.TTFLmail && cookies.TTFLhash === COOKIES.TTFLhash) {
        const sid = cookies.PHPSESSID ?? `S${++counter}`
        sessions.add(sid)
        // après la reconnexion, TTFL renvoie vers l'accueil, pas vers la page demandée
        return redirect('/', [`PHPSESSID=${sid}; path=/`, ...(renew ? ['TTFLhash=HASH-RENOUVELE; expires=Fri, 01 Jan 2100 00:00:00 GMT; path=/'] : [])])
      }
      return new Response('<form><input type="password" name="pw"></form>', { status: 200 })
    }
    if (!cookies.PHPSESSID || !sessions.has(cookies.PHPSESSID)) {
      return redirect('login.php', [`PHPSESSID=${cookies.PHPSESSID ?? `S${++counter}`}; path=/`])
    }
    const tpl = url.searchParams.get('tpl')
    const body =
      tpl === 'team' ? TEAM : tpl === 'historique' ? HISTORY : tpl === 'halloffame' ? (url.searchParams.get('ttpl') ? PROFILES[url.searchParams.get('ttpl')!] : OWN) : '<html>Accueil</html>'
    return new Response(body, { status: 200 })
  }
  return { fetchImpl, requested }
}

// ───────────────────────── Faux Supabase ─────────────────────────

function fakeSupabase() {
  const calls: Array<{ url: string; headers: Record<string, string>; body: { p_token: string; p_members: Array<{ name: string; picks: unknown[] }> } }> = []
  const fetchImpl = async (url: string, init: { headers: Record<string, string>; body: string }) => {
    const body = JSON.parse(init.body)
    calls.push({ url, headers: init.headers, body })
    if (body.p_token !== TOKEN) {
      return new Response(JSON.stringify({ code: '28000', message: 'Code de synchronisation invalide' }), { status: 403 })
    }
    const picks = body.p_members.reduce((n: number, m: { picks: unknown[] }) => n + m.picks.length, 0)
    return new Response(JSON.stringify({ members: body.p_members.length, picks, created: 0, skipped: 0 }), { status: 200 })
  }
  return { fetchImpl, calls }
}

/** Réseau complet : TTFL d'un côté, Supabase de l'autre. */
function fakeNetwork(opts?: Parameters<typeof fakeTtfl>[0]) {
  const ttfl = fakeTtfl(opts)
  const supa = fakeSupabase()
  const fetchImpl = (url: string, init: never) => (url.startsWith('https://kyrzethmknbiwxmkcyet.supabase.co') ? supa.fetchImpl(url, init) : ttfl.fetchImpl(url, init))
  return { fetchImpl, ttfl, supa }
}

const notifier = () => {
  const sent: Array<{ title: string; content: string; bad?: boolean }> = []
  return { sent, notify: async (n: { title: string; content: string; bad?: boolean }) => void sent.push(n) }
}

const config = (extra = {}) => ({ token: TOKEN, cookies: { ...COOKIES }, afterHour: 9, ...extra })
const MORNING = new Date('2026-11-24T09:30:00Z') // 10 h 30 à Paris

// ───────────────────────── Tests ─────────────────────────

describe('createJar', () => {
  it('garde les cookies posés par TTFL et en renvoie l’en-tête', () => {
    const jar = createJar({ TTFLmail: 'a' })
    jar.update(['PHPSESSID=abc; path=/; HttpOnly', 'autre=1'])
    expect(jar.header()).toBe('TTFLmail=a; PHPSESSID=abc; autre=1')
    expect(jar.get('PHPSESSID')).toBe('abc')
  })

  it('applique les remplacements, suppressions et dates d’expiration', () => {
    const jar = createJar({ TTFLhash: 'old', gone: 'x', old: 'y' })
    jar.update([
      'TTFLhash=new; expires=Fri, 01 Jan 2100 00:00:00 GMT',
      'gone=deleted; path=/',
      'old=z; max-age=0',
    ])
    expect(jar.get('TTFLhash')).toBe('new')
    expect(jar.expiry('TTFLhash')).toBe(Date.UTC(2100, 0, 1))
    expect(jar.get('gone')).toBeUndefined()
    expect(jar.get('old')).toBeUndefined()
  })
})

describe('ttflFetch', () => {
  it('suit les redirections, en gardant les cookies posés en chemin', async () => {
    const { fetchImpl } = fakeTtfl()
    const jar = createJar(COOKIES)
    const { html, url } = await ttflFetch('https://fantasy.trashtalk.co/?tpl=team', { jar, fetchImpl })
    expect(url).toBe('https://fantasy.trashtalk.co/') // atterri sur l'accueil après la reconnexion
    expect(html).toContain('Accueil')
    expect(jar.get('PHPSESSID')).toMatch(/^S\d+$/)
  })

  it('refuse une réponse en erreur et une boucle de redirections', async () => {
    const jar = createJar()
    await expect(ttflFetch('https://x/', { jar, fetchImpl: async () => new Response('boom', { status: 500 }) })).rejects.toThrow(/500/)
    const loop = async () => new Response(null, { status: 302, headers: { Location: '/encore' } })
    await expect(ttflFetch('https://x/', { jar, fetchImpl: loop })).rejects.toThrow(/boucle/)
  })
})

describe('collect', () => {
  it('se reconnecte avec les cookies, puis relève l’équipe : moi (historique) d’abord, les autres (5 derniers picks)', async () => {
    const { fetchImpl, ttfl } = fakeNetwork()
    const payload = await collect({ jar: createJar(COOKIES), fetchImpl }, parsers, { pause: 0, sleep: instant })

    expect(payload.map((m: { name: string }) => m.name)).toEqual(['Alice', 'Bob', 'Carl'])
    expect(payload[0].picks).toEqual([
      { date: '2026-11-18', player: 'Jalen Brunson', score: 43, x2: false },
      { date: '2026-11-17', player: 'Victor Wembanyama', score: 56, x2: true },
    ])
    expect(payload[1].picks).toHaveLength(2)
    expect(payload[1].picks[1]).toEqual({ date: '2026-11-17', player: 'Scottie Barnes', score: 32, x2: true })
    expect(payload[2].picks).toEqual([{ date: '2026-11-18', player: 'Tyrese Maxey', score: 40, x2: false }])
    // pas de profil lu pour moi (111) : mon historique complet suffit ; une douzaine de pages au plus
    expect(ttfl.requested.some((r) => r.includes('ttpl=111'))).toBe(false)
    expect(ttfl.requested.filter((r) => r.includes('tpl=')).length).toBeLessThanOrEqual(12)
  })

  it('laisse un temps entre deux pages', async () => {
    const { fetchImpl } = fakeNetwork()
    const pauses: number[] = []
    await collect({ jar: createJar(COOKIES), fetchImpl }, parsers, { pause: 600, sleep: async (ms: number) => void pauses.push(ms) })
    expect(pauses.length).toBeGreaterThanOrEqual(5)
    expect(pauses.every((ms) => ms === 600)).toBe(true)
  })

  it('signale une session expirée quand les cookies ne reconnectent plus', async () => {
    const { fetchImpl } = fakeNetwork({ rememberOk: false })
    await expect(collect({ jar: createJar(COOKIES), fetchImpl }, parsers, { pause: 0, sleep: instant })).rejects.toThrow(/Session TTFL expirée/)
    await expect(collect({ jar: createJar({}), fetchImpl }, parsers, { pause: 0, sleep: instant })).rejects.toMatchObject({ name: 'SessionExpired' })
  })
})

describe('send', () => {
  it('envoie les picks avec la seule clé publique et le code de synchronisation', async () => {
    const { fetchImpl, calls } = fakeSupabase()
    const res = await send(TOKEN, [{ name: 'Alice', picks: [{ date: '2026-11-18', player: 'X' }] }], { fetchImpl })
    expect(res).toMatchObject({ members: 1, picks: 1 })
    expect(calls[0].url).toBe('https://kyrzethmknbiwxmkcyet.supabase.co/rest/v1/rpc/sync_team_picks')
    expect(Object.keys(calls[0].headers).sort()).toEqual(['Content-Type', 'apikey'])
    expect(calls[0].headers.apikey).toMatch(/^sb_publishable_/)
  })

  it('refuse un code de synchronisation invalide avec le message de la base', async () => {
    const { fetchImpl } = fakeSupabase()
    await expect(send('MAUVAIS', [], { fetchImpl })).rejects.toMatchObject({ name: 'SyncRefused', message: 'Code de synchronisation invalide' })
  })
})

describe('shouldRun', () => {
  it('lance une fois par jour, après l’heure choisie (heure de Paris)', () => {
    expect(shouldRun({ state: {}, now: new Date('2026-11-24T08:30:00Z') }).run).toBe(true) // 9 h 30
    expect(shouldRun({ state: {}, now: new Date('2026-11-24T07:30:00Z') })).toMatchObject({ run: false, reason: 'pas avant 9 h' }) // 8 h 30
    expect(shouldRun({ state: { lastOk: '2026-11-24' }, now: MORNING })).toMatchObject({ run: false, reason: 'déjà fait aujourd’hui' })
    expect(shouldRun({ state: { lastOk: '2026-11-23' }, now: MORNING }).run).toBe(true)
  })

  it('suit le jour de Paris, pas celui d’UTC', () => {
    expect(parisParts(new Date('2026-11-24T23:30:00Z'))).toEqual({ day: '2026-11-25', hour: 0 })
    expect(parisParts(new Date('2026-07-24T22:30:00Z'))).toEqual({ day: '2026-07-25', hour: 0 }) // heure d'été
    expect(shouldRun({ state: { lastOk: '2026-11-24' }, now: new Date('2026-11-24T23:30:00Z') }).run).toBe(false) // 0 h 30 : trop tôt
  })

  it('s’arrête après 3 échecs dans la journée, sauf lancement forcé', () => {
    const state = { attempts: { day: '2026-11-24', n: 3 } }
    expect(shouldRun({ state, now: MORNING })).toMatchObject({ run: false })
    expect(shouldRun({ state: { attempts: { day: '2026-11-23', n: 3 } }, now: MORNING }).run).toBe(true)
    expect(shouldRun({ state, now: MORNING, force: true }).run).toBe(true)
  })
})

describe('daysLeft', () => {
  it('compte les jours avant l’expiration des cookies', () => {
    expect(daysLeft('2026-12-01', MORNING)).toBe(7)
    expect(daysLeft(Date.parse('2026-11-20T00:00:00Z'), MORNING)).toBeLessThanOrEqual(0)
    expect(daysLeft(undefined, MORNING)).toBeUndefined()
    expect(daysLeft('n’importe quoi', MORNING)).toBeUndefined()
  })
})

describe('runOnce', () => {
  it('relève, envoie, note la date et notifie le succès', async () => {
    const { fetchImpl, supa } = fakeNetwork()
    const { sent, notify } = notifier()
    const res = await runOnce({ config: config(), parsers, fetchImpl, notify, now: MORNING, sleep: instant, pause: 0 })
    expect(res).toMatchObject({ ran: true, ok: true })
    expect(res.state.lastOk).toBe('2026-11-24')
    // Alice 2 picks (historique) + Bob 2 + Carl 1 : le faux Supabase compte tout ce qu'il reçoit
    expect(sent).toEqual([{ title: 'Relevé TTFL ✔', content: '5 picks mis à jour pour l’équipe.' }])
    expect(supa.calls).toHaveLength(1)
    // un second passage le même jour ne refait rien et ne notifie pas
    const again = await runOnce({ config: config(), state: res.state, parsers, fetchImpl, notify, now: MORNING, sleep: instant, pause: 0 })
    expect(again.ran).toBe(false)
    expect(sent).toHaveLength(1)
    expect(supa.calls).toHaveLength(1)
  })

  it('garde les cookies renouvelés par TTFL et leur nouvelle date d’expiration', async () => {
    const { fetchImpl } = fakeNetwork({ renew: true })
    const { notify } = notifier()
    const res = await runOnce({ config: config(), parsers, fetchImpl, notify, now: MORNING, sleep: instant, pause: 0 })
    expect(res.cookies).toEqual({ TTFLmail: 'MAIL-SECRET', TTFLhash: 'HASH-RENOUVELE' })
    expect(res.cookieExpiresAt).toBe('2100-01-01')
  })

  it('prévient quand les cookies expirent bientôt', async () => {
    const { fetchImpl } = fakeNetwork()
    const { sent, notify } = notifier()
    await runOnce({ config: config({ cookieExpiresAt: '2026-12-01' }), parsers, fetchImpl, notify, now: MORNING, sleep: instant, pause: 0 })
    expect(sent[0].content).toContain('expiration dans 7 j')
    const calm = notifier()
    await runOnce({ config: config({ cookieExpiresAt: '2027-03-01' }), parsers, fetchImpl, notify: calm.notify, now: MORNING, sleep: instant, pause: 0, force: true })
    expect(calm.sent[0].content).not.toContain('expiration')
  })

  it('notifie un échec de connexion et compte l’essai', async () => {
    const { fetchImpl, supa } = fakeNetwork({ rememberOk: false })
    const { sent, notify } = notifier()
    const res = await runOnce({ config: config(), parsers, fetchImpl, notify, now: MORNING, sleep: instant, pause: 0 })
    expect(res).toMatchObject({ ran: true, ok: false })
    expect(res.state.attempts).toEqual({ day: '2026-11-24', n: 1 })
    expect(res.state.lastOk).toBeUndefined()
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ title: 'Relevé TTFL ✘', bad: true })
    expect(sent[0].content).toContain('Session TTFL expirée')
    expect(supa.calls).toHaveLength(0) // rien n'est envoyé si la lecture a échoué
  })

  it('notifie un code de synchronisation refusé', async () => {
    const { fetchImpl } = fakeNetwork()
    const { sent, notify } = notifier()
    const res = await runOnce({ config: config({ token: 'PERIME' }), parsers, fetchImpl, notify, now: MORNING, sleep: instant, pause: 0 })
    expect(res.ok).toBe(false)
    expect(sent[0].content).toContain('Code de synchronisation refusé')
  })

  it('notifie une panne de réseau', async () => {
    const { sent, notify } = notifier()
    const down = async () => {
      throw new TypeError('fetch failed')
    }
    await runOnce({ config: config(), parsers, fetchImpl: down, notify, now: MORNING, sleep: instant, pause: 0 })
    expect(sent[0].content).toBe('Pas de connexion à Internet.')
  })

  it('ne dit jamais rien de secret : ni cookies, ni code, ni dans le journal', async () => {
    const logs: string[] = []
    for (const opts of [{}, { rememberOk: false }]) {
      const { fetchImpl } = fakeNetwork(opts)
      const { sent, notify } = notifier()
      await runOnce({ config: config(), parsers, fetchImpl, notify, now: MORNING, sleep: instant, pause: 0, log: (m: string) => logs.push(m) })
      const everything = JSON.stringify(sent) + logs.join('\n')
      for (const secret of ['MAIL-SECRET', 'HASH-SECRET', TOKEN]) expect(everything).not.toContain(secret)
    }
  })
})

describe('explain', () => {
  it('donne un message court et utile', () => {
    expect(explain(new Error('x'.repeat(300))).length).toBeLessThanOrEqual(160)
    expect(explain(new Error('TTFL a répondu 503'))).toBe('TTFL a répondu 503')
    expect(explain(new TypeError('fetch failed'))).toBe('Pas de connexion à Internet.')
  })
})

describe('makeNotifier', () => {
  it('appelle termux-notification avec un identifiant fixe (la notification est remplacée, pas empilée)', async () => {
    const calls: string[][] = []
    const notify = makeNotifier((cmd: string, args: string[], cb: (e: Error | null) => void) => {
      calls.push([cmd, ...args])
      cb(null)
    })
    expect(await notify({ title: 'Relevé TTFL ✔', content: 'ok' })).toBe(true)
    expect(await notify({ title: 'Relevé TTFL ✘', content: 'raté', bad: true })).toBe(true)
    expect(calls[0]).toEqual(['termux-notification', '--id', 'ttfl-releve', '--title', 'Relevé TTFL ✔', '--content', 'ok', '--priority', 'default'])
    expect(calls[1].slice(-2)).toEqual(['--priority', 'high'])
  })

  it('ne plante pas si Termux:API n’est pas installé', async () => {
    const notify = makeNotifier((_cmd: string, _args: string[], cb: (e: Error | null) => void) => cb(new Error('ENOENT')))
    expect(await notify({ title: 't', content: 'c' })).toBe(false)
  })
})

describe('loadParsers', () => {
  it('réutilise les fonctions de lecture du script du navigateur (une seule version, testée)', () => {
    expect(Object.keys(parsers).sort()).toEqual(['buildPayload', 'parseOwnName', 'parsePicksTable', 'parseTeamMembers', 'toIsoDate', 'todayParis'])
  })
})
