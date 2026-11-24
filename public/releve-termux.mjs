#!/usr/bin/env node
// TTFL 76ersFR — relevé automatique des picks, version téléphone Android (Termux).
//
// Pour qui : celles et ceux qui n'ont pas de navigateur acceptant les scripts (Chrome sur Android, par exemple).
// Ce que ça fait, en arrière-plan, une fois par jour : se connecte à TTFL avec les deux cookies « se souvenir de moi »
// de TON compte, lit la page équipe, le profil de chaque coéquipier (ses 5 derniers picks), ton profil et ton historique,
// envoie les picks PASSÉS à l'appli d'équipe, puis te notifie : relevé fait, ou pourquoi il a échoué.
//
// Ce qu'il ne fait pas : aucun mot de passe n'est saisi, aucun captcha n'est contourné (la connexion avec captcha reste
// celle de ton navigateur), et rien ne quitte ton téléphone en dehors des picks envoyés à l'appli.
// Les cookies et le code de synchronisation sont gardés dans config.json, lisible par toi seul (chmod 600).
// ⚠️ Les cookies TTFLmail / TTFLhash équivalent à ton identifiant TTFL : ne les partage avec personne.
//
// Utilisation : voir « node releve-termux.mjs help », ou le guide de l'onglet Équipe de l'appli.

import { execFile } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseHTML } from 'linkedom'

export const VERSION = '1.0.0'

const TTFL = 'https://fantasy.trashtalk.co'
const SUPABASE_URL = 'https://kyrzethmknbiwxmkcyet.supabase.co'
// Clé publique (faite pour être visible) : le code de synchronisation de l'équipe est le vrai secret.
const SUPABASE_KEY = 'sb_publishable_3Ov7ZQPEb1B2koGlS1odow_gHo25Yoq'
const USER_AGENT = `ttfl-76ers-releve/${VERSION} (Termux; usage personnel)`
const JOB_ID = 76
const JOB_PERIOD_MS = 3 * 3_600_000 // le programme décide lui-même s'il y a quelque chose à faire (une fois par jour)
const REMEMBER_COOKIES = ['TTFLmail', 'TTFLhash']

const HERE = dirname(fileURLToPath(import.meta.url))
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// ───────────────────────── Lecture des pages : mêmes fonctions que le script du navigateur ─────────────────────────

/** Fonctions de lecture de `ttfl-releve.user.js` (même dossier) : une seule version, testée, pour les deux usages. */
export function loadParsers(path = join(HERE, 'ttfl-releve.user.js')) {
  const holder = { exports: {} }
  new Function('module', readFileSync(path, 'utf8'))(holder)
  return holder.exports
}

// ───────────────────────── Erreurs lisibles ─────────────────────────

export class SessionExpired extends Error {
  constructor() {
    super('Session TTFL expirée : les cookies TTFLmail et TTFLhash ne permettent plus de se connecter.')
    this.name = 'SessionExpired'
  }
}
export class SyncRefused extends Error {
  constructor(message) {
    super(message)
    this.name = 'SyncRefused'
  }
}

/** Message court pour la notification. */
export function explain(e) {
  if (e instanceof SessionExpired) return 'Session TTFL expirée : recopie les cookies TTFLmail et TTFLhash (guide dans l’appli).'
  if (e instanceof SyncRefused && /invalide/i.test(e.message)) {
    return 'Code de synchronisation refusé : génère-en un nouveau dans l’appli (onglet Équipe) puis relance « setup ».'
  }
  const text = String((e && e.message) || e)
  if (e instanceof TypeError || /fetch failed|ENOTFOUND|ECONNRESET|ETIMEDOUT|EAI_AGAIN/i.test(text)) {
    return 'Pas de connexion à Internet.'
  }
  return text.length > 160 ? text.slice(0, 157) + '…' : text
}

// ───────────────────────── Cookies et requêtes ─────────────────────────

/** Mini pot de cookies : TTFL pose un PHPSESSID à la connexion et peut renouveler les cookies « se souvenir de moi ». */
export function createJar(initial = {}) {
  const cookies = { ...initial }
  const expiries = {}
  return {
    header: () => Object.entries(cookies).map(([name, value]) => `${name}=${value}`).join('; '),
    get: (name) => cookies[name],
    /** Date d'expiration (ms) annoncée par TTFL pour ce cookie, si elle l'a annoncée. */
    expiry: (name) => expiries[name],
    snapshot: () => ({ ...cookies }),
    update(setCookieHeaders) {
      for (const line of setCookieHeaders || []) {
        const [pair, ...attrs] = line.split(';')
        const eq = pair.indexOf('=')
        if (eq < 1) continue
        const name = pair.slice(0, eq).trim()
        const value = pair.slice(eq + 1).trim()
        const attr = (key) => {
          const found = attrs.map((a) => a.trim()).find((a) => a.toLowerCase().startsWith(key + '='))
          return found ? found.slice(key.length + 1) : undefined
        }
        const expires = attr('expires') !== undefined ? Date.parse(attr('expires')) : undefined
        const maxAge = attr('max-age') !== undefined ? Number(attr('max-age')) : undefined
        const gone = value === '' || value.toLowerCase() === 'deleted' || (expires !== undefined && expires < Date.now()) || (maxAge !== undefined && maxAge <= 0)
        if (gone) {
          delete cookies[name]
          delete expiries[name]
        } else {
          cookies[name] = value
          if (expires !== undefined && !Number.isNaN(expires)) expiries[name] = expires
        }
      }
    },
  }
}

/** GET avec le pot de cookies, en suivant les redirections à la main (TTFL redirige vers login.php sans session). */
export async function ttflFetch(url, { jar, fetchImpl = fetch, maxRedirects = 6 }) {
  let current = url
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const headers = { 'User-Agent': USER_AGENT, Accept: 'text/html' }
    if (jar.header()) headers.Cookie = jar.header()
    const res = await fetchImpl(current, { redirect: 'manual', headers })
    jar.update(typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [])
    const location = res.headers.get('location')
    if (res.status >= 300 && res.status < 400 && location) {
      current = new URL(location, current).href
      continue
    }
    if (!res.ok) throw new Error(`TTFL a répondu ${res.status}`)
    return { html: await res.text(), url: current }
  }
  throw new Error('TTFL redirige en boucle')
}

// ───────────────────────── Relevé ─────────────────────────

const rowsOf = (document) => {
  const table = document.querySelector('table')
  if (!table) return []
  return [...table.querySelectorAll('tr')].map((tr) => [...tr.children].map((c) => c.textContent.replace(/\s+/g, ' ').trim()))
}

/** Lit TTFL (≈ 12 pages, espacées) et prépare l'envoi : même enchaînement que le script du navigateur. */
export async function collect({ jar, fetchImpl }, parsers, { pause = 600, sleep = defaultSleep } = {}) {
  const get = async (query) => {
    const { html } = await ttflFetch(`${TTFL}/${query}`, { jar, fetchImpl })
    return parseHTML(html).document
  }

  // Ouvre la session : avec les cookies « se souvenir de moi », TTFL reconnecte tout seul puis redirige vers l'accueil
  // (et non vers la page demandée), d'où cette première requête avant de lire quoi que ce soit.
  await ttflFetch(`${TTFL}/`, { jar, fetchImpl })
  await sleep(pause)

  const teamDoc = await get('?tpl=team')
  const members = parsers.parseTeamMembers(
    [...teamDoc.querySelectorAll('li.member-item .rk-name a')].map((a) => ({ name: a.textContent, href: a.getAttribute('href') })),
  )
  // Sans session, TTFL affiche la page de connexion : aucune équipe n'apparaît.
  if (members.length === 0) throw new SessionExpired()

  await sleep(pause)
  const ownDoc = await get('?tpl=halloffame')
  const ownName = parsers.parseOwnName([...ownDoc.querySelectorAll('h1,h2,h3')].map((h) => h.textContent))
  if (!ownName) throw new Error('Ton pseudo est introuvable sur TTFL.')

  await sleep(pause)
  const mine = parsers.parsePicksTable(rowsOf(await get('?tpl=historique')))

  const others = []
  for (const member of members) {
    if (member.name.toLowerCase() === ownName.toLowerCase()) continue
    await sleep(pause)
    others.push({ name: member.name, picks: parsers.parsePicksTable(rowsOf(await get(`?tpl=halloffame&ttpl=${member.id}`))) })
  }
  return parsers.buildPayload({ name: ownName, picks: mine }, others)
}

/** Envoi à l'appli d'équipe (fonction sync_team_picks de Supabase), avec le code de synchronisation. */
export async function send(token, payload, { fetchImpl = fetch } = {}) {
  const res = await fetchImpl(`${SUPABASE_URL}/rest/v1/rpc/sync_team_picks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY },
    body: JSON.stringify({ p_token: token, p_members: payload }),
  })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    // réponse non JSON : on se contente du code HTTP
  }
  if (res.ok) return json || {}
  throw new SyncRefused((json && json.message) || `Erreur ${res.status}`)
}

// ───────────────────────── Quand lancer ─────────────────────────

/** Jour et heure à Paris (le jour de deck de TTFL suit l'heure de Paris). */
export function parisParts(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  )
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) }
}

/** Une fois par jour, après l'heure choisie, avec au plus 3 essais par jour ; `force` ignore ces règles. */
export function shouldRun({ state = {}, now = new Date(), afterHour = 9, maxAttempts = 3, force = false }) {
  if (force) return { run: true }
  const { day, hour } = parisParts(now)
  if (state.lastOk === day) return { run: false, reason: 'déjà fait aujourd’hui' }
  if (hour < afterHour) return { run: false, reason: `pas avant ${afterHour} h` }
  const attempts = state.attempts && state.attempts.day === day ? state.attempts.n : 0
  if (attempts >= maxAttempts) return { run: false, reason: 'trop d’échecs aujourd’hui, nouvel essai demain' }
  return { run: true }
}

/** Jours restants avant une date (« 2027-02-12 » ou ms), ou undefined si inconnue. */
export function daysLeft(expiresAt, now = new Date()) {
  if (!expiresAt) return undefined
  const t = typeof expiresAt === 'number' ? expiresAt : Date.parse(expiresAt)
  return Number.isNaN(t) ? undefined : Math.ceil((t - now.getTime()) / 86_400_000)
}

/**
 * Un passage : décide s'il faut relever, relève, envoie, puis notifie. Ne lève jamais d'erreur : tout est dans le résultat.
 * Renvoie le nouvel état, et les cookies « se souvenir de moi » éventuellement renouvelés par TTFL.
 */
export async function runOnce({ config, state = {}, parsers, fetchImpl = fetch, notify, now = new Date(), force = false, sleep, pause, log = () => {} }) {
  const decision = shouldRun({ state, now, afterHour: config.afterHour ?? 9, force })
  if (!decision.run) {
    log(`Rien à faire : ${decision.reason}.`)
    return { ran: false, state }
  }

  const { day } = parisParts(now)
  const attempts = { day, n: (state.attempts && state.attempts.day === day ? state.attempts.n : 0) + 1 }
  const jar = createJar(config.cookies)
  try {
    const payload = await collect({ jar, fetchImpl }, parsers, { sleep, pause })
    const result = await send(config.token, payload, { fetchImpl })

    // Date d'expiration des cookies : celle que TTFL vient d'annoncer, sinon celle saisie à l'installation.
    const announced = REMEMBER_COOKIES.map((n) => jar.expiry(n)).filter(Boolean)
    const expiresAt = announced.length ? Math.min(...announced) : config.cookieExpiresAt
    const left = daysLeft(expiresAt, now)
    const picks = Number(result.picks) || 0
    let content = picks ? `${picks} pick${picks > 1 ? 's' : ''} mis à jour pour l’équipe.` : 'Équipe à jour, rien de nouveau.'
    if (left !== undefined && left <= 14) content += ` ⚠️ Cookies TTFL : expiration dans ${Math.max(left, 0)} j.`
    await notify({ title: 'Relevé TTFL ✔', content })
    log(`Relevé fait : ${picks} pick(s) mis à jour, ${result.members ?? '?'} membre(s).`)

    const cookies = {}
    for (const name of REMEMBER_COOKIES) if (jar.get(name)) cookies[name] = jar.get(name)
    return {
      ran: true,
      ok: true,
      state: { ...state, lastOk: day, attempts: { day, n: 0 }, lastResult: { at: now.toISOString(), picks } },
      cookies,
      cookieExpiresAt: announced.length ? new Date(expiresAt).toISOString().slice(0, 10) : undefined,
    }
  } catch (e) {
    log(`Échec : ${(e && e.message) || e}`)
    await notify({ title: 'Relevé TTFL ✘', content: explain(e), bad: true })
    return { ran: true, ok: false, state: { ...state, attempts }, error: e }
  }
}

// ───────────────────────── Notifications et planification (Termux:API) ─────────────────────────

/** Notification Android via Termux:API ; renvoie false (sans planter) si Termux:API n'est pas installé. */
export function makeNotifier(execFileImpl = execFile) {
  return ({ title, content, bad }) =>
    new Promise((resolve) => {
      execFileImpl(
        'termux-notification',
        ['--id', 'ttfl-releve', '--title', title, '--content', content, '--priority', bad ? 'high' : 'default'],
        (error) => resolve(!error),
      )
    })
}

const run = (cmd, args, execFileImpl = execFile) =>
  new Promise((resolve) => execFileImpl(cmd, args, (error, stdout, stderr) => resolve({ ok: !error, out: String(stdout || '') + String(stderr || '') })))

// ───────────────────────── Fichiers : configuration, état, journal ─────────────────────────

export const paths = (dir) => ({
  config: join(dir, 'config.json'),
  state: join(dir, 'state.json'),
  log: join(dir, 'run.log'),
  runSh: join(dir, 'run.sh'),
})

const readJson = (file, fallback) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function writePrivate(file, data) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, data, { mode: 0o600 })
  try {
    chmodSync(file, 0o600)
  } catch {
    // systèmes de fichiers sans droits Unix : tant pis
  }
}

/** Sortie horodatée : la tâche planifiée la redirige vers run.log (jamais de cookie ni de code dans ces lignes). */
const log = (message) => console.log(`[${new Date().toISOString()}] ${message}`)

/** Garde le journal court : au-delà de 200 Ko, on repart d'un fichier vide. */
function trimLog(file) {
  try {
    if (existsSync(file) && statSync(file).size > 200_000) writeFileSync(file, '')
  } catch {
    // journal indisponible : sans importance
  }
}

// ───────────────────────── Commandes ─────────────────────────

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    rl.question(question, (answer) => {
      rl.close()
      if (hidden) process.stdout.write('\n')
      resolve(answer.trim())
    })
    // Les valeurs secrètes (cookies, code) ne s'affichent pas : une étoile par caractère collé.
    if (hidden) rl._writeToOutput = () => rl.output.write('*')
  })
}

const HELP = `TTFL 76ersFR — relevé des picks (Termux) v${VERSION}

  node releve-termux.mjs setup      installation guidée : code, cookies, planification, premier relevé
  node releve-termux.mjs run        un passage (fait par la tâche planifiée ; une fois par jour au plus)
  node releve-termux.mjs run --force   relever maintenant, même si c'est déjà fait aujourd'hui
  node releve-termux.mjs status     état : dernier relevé, tâche planifiée
  node releve-termux.mjs remove     annule la tâche planifiée

Fichiers (dossier du programme) : config.json (cookies et code, confidentiels), state.json, run.log.`

async function cmdSetup(dir, io = {}) {
  const p = paths(dir)
  const prompt = io.ask || ask
  const notify = io.notify || makeNotifier()
  console.log('Installation du relevé TTFL. Les valeurs secrètes ne s’affichent pas (une étoile par caractère).\n')

  const token = await prompt('Code de synchronisation (appli, onglet Équipe) : ', { hidden: true })
  const mail = await prompt('Cookie TTFLmail (valeur) : ', { hidden: true })
  const hash = await prompt('Cookie TTFLhash (valeur) : ', { hidden: true })
  const expires = await prompt('Date d’expiration de ces cookies (AAAA-MM-JJ, vide si inconnue) : ')
  const hourText = await prompt('Relever à partir de quelle heure, heure de Paris ? [9] : ')
  if (!token || !mail || !hash) {
    console.error('\nIl manque le code ou un cookie : rien n’a été enregistré.')
    return 1
  }
  const afterHour = Number.isInteger(Number(hourText)) && hourText !== '' ? Math.min(Math.max(Number(hourText), 0), 23) : 9
  const config = { token, cookies: { TTFLmail: mail, TTFLhash: hash }, afterHour }
  if (/^\d{4}-\d{2}-\d{2}$/.test(expires)) config.cookieExpiresAt = expires
  writePrivate(p.config, JSON.stringify(config, null, 2))
  console.log('\nConfiguration enregistrée (lisible par toi seul).')

  writeFileSync(
    p.runSh,
    `#!/data/data/com.termux/files/usr/bin/sh\nexport PATH=/data/data/com.termux/files/usr/bin:$PATH\nexport HOME=/data/data/com.termux/files/home\ncd "${dir}" && node releve-termux.mjs run >> run.log 2>&1\n`,
    { mode: 0o700 },
  )

  const sched = await run('termux-job-scheduler', ['--job-id', String(JOB_ID), '--script', p.runSh, '--period-ms', String(JOB_PERIOD_MS), '--network', 'any', '--persisted', 'true'])
  console.log(sched.ok ? 'Tâche planifiée : vérification toutes les 3 h, relevé une fois par jour.' : `⚠️ Planification impossible (Termux:API est-il installé ?) :\n${sched.out}`)

  console.log('\nPremier relevé, tout de suite…')
  return cmdRun(dir, { force: true, notify })
}

async function cmdRun(dir, { force = false, notify = makeNotifier() } = {}) {
  const p = paths(dir)
  trimLog(p.log)
  const config = readJson(p.config, null)
  if (!config || !config.token || !config.cookies) {
    log('Pas de configuration : lance « node releve-termux.mjs setup ».')
    return 1
  }
  const state = readJson(p.state, {})
  const result = await runOnce({ config, state, parsers: loadParsers(join(dir, 'ttfl-releve.user.js')), notify, force, log })
  if (result.ran || result.state !== state) writePrivate(p.state, JSON.stringify(result.state, null, 2))
  if (result.ok) {
    // TTFL peut renouveler les cookies « se souvenir de moi » : on garde les plus récents.
    const next = { ...config, cookies: { ...config.cookies, ...result.cookies } }
    if (result.cookieExpiresAt) next.cookieExpiresAt = result.cookieExpiresAt
    writePrivate(p.config, JSON.stringify(next, null, 2))
  }
  return result.ran && !result.ok ? 1 : 0
}

async function cmdStatus(dir) {
  const p = paths(dir)
  const config = readJson(p.config, null)
  const state = readJson(p.state, {})
  console.log(`Configuration : ${config ? 'présente' : 'absente (lance setup)'}`)
  if (config) {
    console.log(`Relevé à partir de : ${config.afterHour ?? 9} h (Paris)`)
    const left = daysLeft(config.cookieExpiresAt)
    console.log(`Cookies TTFL : ${left === undefined ? 'expiration inconnue' : left > 0 ? `expirent dans ${left} jour(s)` : 'expirés'}`)
  }
  console.log(`Dernier relevé réussi : ${state.lastOk || 'jamais'}`)
  const pending = await run('termux-job-scheduler', ['--pending'])
  console.log(`Tâche planifiée : ${pending.ok ? (pending.out.includes(`Job ${JOB_ID}`) || pending.out.includes(String(JOB_ID)) ? 'active' : 'absente (relance setup)') : 'inconnue (Termux:API ?)'}`)
  return 0
}

async function cmdRemove() {
  const r = await run('termux-job-scheduler', ['--cancel', '--job-id', String(JOB_ID)])
  console.log(r.ok ? 'Tâche planifiée annulée.' : `Impossible d’annuler : ${r.out}`)
  return r.ok ? 0 : 1
}

export async function main(argv, dir = process.env.TTFL_RELEVE_DIR || HERE) {
  const [command = 'help', ...flags] = argv
  switch (command) {
    case 'setup':
      return cmdSetup(dir)
    case 'run':
      return cmdRun(dir, { force: flags.includes('--force') })
    case 'status':
      return cmdStatus(dir)
    case 'remove':
      return cmdRemove()
    default:
      console.log(HELP)
      return command === 'help' ? 0 : 1
  }
}

// Lancé en ligne de commande (et non importé par les tests).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((code) => process.exit(code))
}
