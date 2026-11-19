// ==UserScript==
// @name         TTFL 76ersFR — relevé des picks
// @namespace    https://azoool.github.io/ttfl-76ers/
// @version      1.0.0
// @description  Une fois par jour, envoie à l'appli d'équipe les derniers picks lus sur TTFL (page équipe, profils, historique).
// @author       76ersFR
// @match        https://fantasy.trashtalk.co/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      kyrzethmknbiwxmkcyet.supabase.co
// @homepageURL  https://azoool.github.io/ttfl-76ers/
// @updateURL    https://azoool.github.io/ttfl-76ers/ttfl-releve.user.js
// @downloadURL  https://azoool.github.io/ttfl-76ers/ttfl-releve.user.js
// ==/UserScript==

/*
 * Relevé des picks de l'équipe 76ersFR.
 *
 * Ce que fait le script, dans TON navigateur, avec TA session TTFL (aucun mot de passe n'est lu ni envoyé) :
 *   1. lit la page « Mon équipe » de TTFL, le profil de chaque coéquipier (ses 5 derniers picks), ton profil et ton historique ;
 *   2. envoie ces picks à l'appli d'équipe (Supabase), avec le code de synchronisation de l'équipe.
 * Il ne tourne qu'une fois par jour (au premier passage sur TTFL), lit au plus une douzaine de pages, espacées de
 * moins d'une seconde, et n'envoie que des picks PASSÉS : ceux du soir sont cachés par TTFL.
 *
 * Les fonctions de lecture (en haut) ne touchent pas au navigateur : elles sont testées dans tests/releve.test.ts.
 */
;(function () {
  'use strict'

  var SUPABASE_URL = 'https://kyrzethmknbiwxmkcyet.supabase.co'
  // Clé publique (faite pour être visible) : le code de synchronisation de l'équipe est le vrai secret.
  var SUPABASE_KEY = 'sb_publishable_3Ov7ZQPEb1B2koGlS1odow_gHo25Yoq'

  // ───────────────────────── Lecture des pages TTFL (pures, testées) ─────────────────────────

  /** « 18-11-2026 » (profil) ou « 2026-11-18 » (historique) → « 2026-11-18 ». */
  function toIsoDate(text) {
    var t = String(text || '').trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
    var m = /^(\d{2})[-/.](\d{2})[-/.](\d{4})$/.exec(t)
    return m ? m[3] + '-' + m[2] + '-' + m[1] : null
  }

  function toInt(text) {
    var n = parseInt(String(text == null ? '' : text).replace(/[^\d-]/g, ''), 10)
    return isFinite(n) ? n : null
  }

  /** Colonne « x2 » : vide ou « non » = pas de bonus. */
  function isYes(text) {
    var t = String(text == null ? '' : text).trim().toLowerCase()
    return t !== '' && !/^(non|no|0|-|—|false)$/.test(t)
  }

  /**
   * Lignes d'un tableau de picks (la première est l'en-tête) → picks.
   * Sert au profil (Date, Joueur, TTFL, x2) comme à l'historique (Date, Joueur, Pts, …, Score, Bonus x2) :
   * les colonnes sont repérées par leur titre, pas par leur position.
   */
  function parsePicksTable(rows) {
    if (!rows || rows.length < 2) return []
    var header = rows[0].map(function (c) {
      return String(c).trim().toLowerCase()
    })
    var find = function (names) {
      for (var i = 0; i < header.length; i++) if (names.indexOf(header[i]) >= 0) return i
      return -1
    }
    var iDate = find(['date'])
    var iPlayer = find(['joueur'])
    var iScore = find(['ttfl', 'score'])
    var iX2 = find(['x2', 'bonus x2'])
    if (iDate < 0 || iPlayer < 0) return []
    var picks = []
    for (var r = 1; r < rows.length; r++) {
      var cells = rows[r]
      var date = toIsoDate(cells[iDate])
      var player = String(cells[iPlayer] || '').trim()
      if (!date || !player) continue
      picks.push({
        date: date,
        player: player,
        score: iScore >= 0 ? toInt(cells[iScore]) : null,
        x2: iX2 >= 0 ? isYes(cells[iX2]) : false,
      })
    }
    return picks
  }

  /** Liens de la page « Mon équipe » → membres (pseudo + identifiant de profil), sans doublon. */
  function parseTeamMembers(links) {
    var seen = {}
    var members = []
    for (var i = 0; i < links.length; i++) {
      var m = /[?&]ttpl=(\d+)/.exec(links[i].href || '')
      var name = String(links[i].name || '').replace(/\s+/g, ' ').trim()
      if (!m || !name || seen[m[1]]) continue
      seen[m[1]] = true
      members.push({ id: m[1], name: name })
    }
    return members
  }

  /** Titres de la page « Mon profil » : le pseudo suit « Fiche joueur ». */
  function parseOwnName(headings) {
    var clean = headings.map(function (h) {
      return String(h).replace(/\s+/g, ' ').trim()
    })
    var i = clean.indexOf('Fiche joueur')
    return i >= 0 && clean[i + 1] ? clean[i + 1] : null
  }

  /** Données à envoyer : moi d'abord (historique complet), puis les coéquipiers (leurs derniers picks). Un pseudo une seule fois. */
  function buildPayload(me, others) {
    var seen = {}
    var out = []
    var all = [me].concat(others)
    for (var i = 0; i < all.length; i++) {
      var m = all[i]
      if (!m || !m.name) continue
      var key = m.name.toLowerCase()
      if (seen[key]) continue
      seen[key] = true
      out.push({ name: m.name, picks: m.picks })
    }
    return out
  }

  /** Date du jour à Paris (« 2026-11-19 ») : le relevé tourne une fois par jour de deck. */
  function todayParis(now) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Paris',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now || new Date())
  }

  var api = {
    toIsoDate: toIsoDate,
    parsePicksTable: parsePicksTable,
    parseTeamMembers: parseTeamMembers,
    parseOwnName: parseOwnName,
    buildPayload: buildPayload,
    todayParis: todayParis,
  }
  // Chargé par les tests (Node) : on expose les fonctions et on s'arrête là.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
    return
  }

  // ───────────────────────── Exécution dans le navigateur ─────────────────────────

  var hasGM = typeof GM_getValue === 'function' && typeof GM_setValue === 'function'
  var store = {
    get: function (key, fallback) {
      if (hasGM) return GM_getValue(key, fallback)
      var v = localStorage.getItem('ttfl76releve.' + key)
      return v === null ? fallback : JSON.parse(v)
    },
    set: function (key, value) {
      if (hasGM) GM_setValue(key, value)
      else localStorage.setItem('ttfl76releve.' + key, JSON.stringify(value))
    },
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms)
    })
  }

  var toastTimer
  function toast(text, bad, ms) {
    var el = document.getElementById('ttfl76-releve-toast')
    if (!el) {
      el = document.createElement('div')
      el.id = 'ttfl76-releve-toast'
      el.style.cssText =
        'position:fixed;right:12px;bottom:12px;z-index:2147483647;max-width:320px;padding:10px 14px;border-radius:10px;' +
        'font:14px/1.35 system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.35);color:#fff'
      document.body.appendChild(el)
    }
    el.style.background = bad ? '#b3261e' : '#0b1f3a'
    el.textContent = text
    clearTimeout(toastTimer)
    toastTimer = setTimeout(function () {
      el.remove()
    }, ms || 7000)
  }

  /** Une page TTFL, lue avec la session du navigateur (même site : aucun mot de passe en jeu). */
  async function fetchDoc(query) {
    var res = await fetch('/' + query, { credentials: 'same-origin' })
    if (!res.ok) throw new Error('TTFL a répondu ' + res.status)
    return new DOMParser().parseFromString(await res.text(), 'text/html')
  }

  function tableRows(doc) {
    var table = doc.querySelector('table')
    if (!table) return []
    return Array.prototype.map.call(table.querySelectorAll('tr'), function (tr) {
      return Array.prototype.map.call(tr.children, function (c) {
        return c.textContent.replace(/\s+/g, ' ').trim()
      })
    })
  }

  /** Lit tout ce qu'il faut sur TTFL (≈ 12 pages, espacées) et prépare l'envoi. */
  async function collect() {
    var teamDoc = await fetchDoc('?tpl=team')
    var members = parseTeamMembers(
      Array.prototype.map.call(teamDoc.querySelectorAll('li.member-item .rk-name a'), function (a) {
        return { name: a.textContent, href: a.getAttribute('href') }
      }),
    )
    if (members.length === 0) throw new Error('Aucune équipe trouvée sur TTFL (es-tu connecté ?)')

    await sleep(600)
    var ownDoc = await fetchDoc('?tpl=halloffame')
    var ownName = parseOwnName(
      Array.prototype.map.call(ownDoc.querySelectorAll('h1,h2,h3'), function (h) {
        return h.textContent
      }),
    )
    if (!ownName) throw new Error('Ton pseudo est introuvable sur TTFL.')

    await sleep(600)
    var mine = parsePicksTable(tableRows(await fetchDoc('?tpl=historique')))

    var others = []
    for (var i = 0; i < members.length; i++) {
      if (members[i].name.toLowerCase() === ownName.toLowerCase()) continue
      await sleep(600)
      var profile = await fetchDoc('?tpl=halloffame&ttpl=' + members[i].id)
      others.push({ name: members[i].name, picks: parsePicksTable(tableRows(profile)) })
    }
    return buildPayload({ name: ownName, picks: mine }, others)
  }

  /** Envoi à Supabase (GM_xmlhttpRequest évite les restrictions de TTFL sur les sites tiers). */
  function send(token, payload) {
    var body = JSON.stringify({ p_token: token, p_members: payload })
    var headers = { 'Content-Type': 'application/json', apikey: SUPABASE_KEY }
    var url = SUPABASE_URL + '/rest/v1/rpc/sync_team_picks'
    var parse = function (status, text) {
      var json
      try {
        json = JSON.parse(text)
      } catch (e) {
        json = null
      }
      if (status >= 200 && status < 300) return json
      throw new Error((json && json.message) || 'Erreur ' + status)
    }
    if (typeof GM_xmlhttpRequest === 'function') {
      return new Promise(function (resolve, reject) {
        GM_xmlhttpRequest({
          method: 'POST',
          url: url,
          headers: headers,
          data: body,
          timeout: 30000,
          onload: function (r) {
            try {
              resolve(parse(r.status, r.responseText))
            } catch (e) {
              reject(e)
            }
          },
          onerror: function () {
            reject(new Error('Pas de connexion à l’appli d’équipe'))
          },
          ontimeout: function () {
            reject(new Error('L’appli d’équipe ne répond pas'))
          },
        })
      })
    }
    return fetch(url, { method: 'POST', headers: headers, body: body }).then(function (r) {
      return r.text().then(function (t) {
        return parse(r.status, t)
      })
    })
  }

  function askToken() {
    var t = prompt('TTFL 76ersFR — colle le code de synchronisation (appli d’équipe → onglet Équipe → Relevé automatique) :')
    t = t ? t.trim() : ''
    if (t) store.set('token', t)
    return t
  }

  var running = false
  async function run(manual) {
    if (running) return
    running = true
    try {
      var token = store.get('token', '')
      if (!token) {
        // Premier passage : on demande le code une fois ; refusé, on ne redemande pas avant demain (sauf lancement manuel).
        if (!manual && store.get('askedOn', '') === todayParis()) return
        store.set('askedOn', todayParis())
        token = askToken()
      }
      if (!token) return
      var payload = await collect()
      var res = await send(token, payload)
      store.set('lastOk', todayParis())
      var picks = res && res.picks != null ? res.picks : 0
      toast('Relevé TTFL : ' + (picks ? picks + ' pick' + (picks > 1 ? 's' : '') + ' mis à jour' : 'à jour') + ' pour l’équipe.')
    } catch (e) {
      toast('Relevé TTFL impossible : ' + (e && e.message ? e.message : e), true, 12000)
    } finally {
      running = false
    }
  }

  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand('Relevé TTFL → équipe : lancer maintenant', function () {
      run(true)
    })
    GM_registerMenuCommand('Relevé TTFL → équipe : changer le code de synchronisation', function () {
      if (askToken()) run(true)
    })
  }

  // Au premier passage de la journée sur TTFL (au plus une tentative toutes les 10 minutes en cas d'échec).
  var lastTry = store.get('lastTry', 0)
  if (store.get('lastOk', '') !== todayParis() && Date.now() - lastTry > 10 * 60 * 1000) {
    store.set('lastTry', Date.now())
    setTimeout(function () {
      run(false)
    }, 4000)
  }
})()
