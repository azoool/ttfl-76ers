import { useCallback, useEffect, useState } from 'react'
import type { TeamApi } from '../hooks/useTeam'
import type { SyncStatus } from '../lib/sync'
import { describeWhen, friendlyError, isMissingFunction } from '../lib/team'

/** Bloc de commandes à copier d'un tap (pour coller dans Termux). */
function CommandBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // copie impossible : la sélection manuelle reste possible
    }
  }
  return (
    <div className="cmd">
      <pre>{text}</pre>
      <button type="button" className="btn small" onClick={copy}>
        {copied ? 'Copié' : 'Copier'}
      </button>
    </div>
  )
}

type State =
  | { kind: 'loading' }
  | { kind: 'ok'; status: SyncStatus }
  /** `schema.sql` n'a pas été relancé depuis la mise à jour de l'appli */
  | { kind: 'outdated' }
  | { kind: 'error'; message: string }

/** Relevé automatique des picks : code de synchronisation de l'équipe et installation du script. */
export function SyncCard({ team }: { team: TeamApi }) {
  const { syncStatus, newSyncToken } = team
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [token, setToken] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>()
  const base = `${location.origin}${location.pathname}`
  const scriptUrl = new URL('ttfl-releve.user.js', base).href
  // Court texte « TTFLmail=…; TTFLhash=… » : seuls ces deux cookies sont copiés, pas les autres (publicité, mesure d'audience…).
  const cookieSnippet =
    "prompt('Copie ce texte', ['TTFLmail', 'TTFLhash'].map(n => document.cookie.split('; ').find(c => c.startsWith(n + '='))).join('; '))"
  const termuxCommands = [
    'pkg update -y && pkg upgrade -y && pkg install -y nodejs termux-api',
    'mkdir -p ~/ttfl-releve && cd ~/ttfl-releve',
    `curl -fsSLO ${new URL('releve-termux.mjs', base).href}`,
    `curl -fsSLO ${scriptUrl}`,
    'npm install linkedom@0.18.15',
  ].join('\n')
  const setupCommand = 'cd ~/ttfl-releve && node releve-termux.mjs setup'

  const refresh = useCallback(
    () =>
      syncStatus()
        .then((status) => setState({ kind: 'ok', status }))
        .catch((e) => setState(isMissingFunction(e) ? { kind: 'outdated' } : { kind: 'error', message: friendlyError(e) })),
    [syncStatus],
  )

  // État au chargement, puis à chaque retour sur l'appli (le relevé tourne ailleurs, dans le navigateur d'un membre).
  useEffect(() => {
    void refresh()
    const onVisible = () => document.visibilityState === 'visible' && void refresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refresh])

  const enabled = state.kind === 'ok' && state.status.enabled

  const generate = async () => {
    if (enabled && !confirm('Remplacer le code ? L’ancien cessera de fonctionner : il faudra coller le nouveau dans le script.')) return
    setBusy(true)
    setMsg(undefined)
    try {
      setToken(await newSyncToken())
      await refresh()
    } catch (e) {
      setMsg({ ok: false, text: isMissingFunction(e) ? 'La base doit d’abord être mise à jour (voir ci-dessus).' : friendlyError(e) })
      if (isMissingFunction(e)) setState({ kind: 'outdated' })
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(token ?? '')
      setMsg({ ok: true, text: 'Code copié.' })
    } catch {
      setMsg({ ok: false, text: 'Copie impossible : sélectionne le code à la main.' })
    }
  }

  return (
    <section className="card">
      <h2>Relevé automatique des picks</h2>
      <p>
        Plus besoin d’importer l’historique tous les jours : un petit script, installé dans le navigateur d’<strong>un seul</strong>{' '}
        membre, relève chaque jour les picks de toute l’équipe sur TTFL et les envoie ici.
      </p>

      {state.kind === 'outdated' && (
        <div className="notice warn">
          La base n’est pas à jour : relance le fichier <code>supabase/schema.sql</code> dans Supabase (SQL Editor → New query →
          Run), puis reviens ici.
        </div>
      )}
      {state.kind === 'error' && <div className="notice bad">{state.message}</div>}
      {state.kind === 'ok' && (
        <p className="muted small">
          {state.status.enabled ? `Dernier relevé : ${describeWhen(state.status.lastSyncAt)}.` : 'Pas encore activé.'}
        </p>
      )}

      {state.kind === 'ok' && (
        <button className="btn primary" onClick={generate} disabled={busy}>
          {busy ? 'Création…' : enabled ? 'Nouveau code de synchronisation' : 'Activer : générer le code'}
        </button>
      )}

      {token && (
        <>
          <div className="code long">{token}</div>
          <div className="row-actions">
            <button className="btn" onClick={copy}>
              Copier le code
            </button>
          </div>
          <div className="notice warn">
            Garde ce code : il ne sera plus affiché. Un nouveau code remplace l’ancien, qui cesse alors de fonctionner.
          </div>
        </>
      )}
      {msg && <div className={`notice ${msg.ok ? 'ok' : 'bad'}`}>{msg.text}</div>}

      <details>
        <summary>
          <strong>Sur ordinateur (une seule personne)</strong>
        </summary>
        <ol className="steps">
          <li>
            Dans un navigateur d’ordinateur (Chrome, Edge, Firefox), installe l’extension <strong>Tampermonkey</strong> (ou
            Violentmonkey).
          </li>
          <li>
            Ouvre{' '}
            <a href={scriptUrl} target="_blank" rel="noopener">
              le script de relevé
            </a>{' '}
            : l’extension propose de l’installer, clique sur « Installer ».
          </li>
          <li>
            Va sur <strong>fantasy.trashtalk.co</strong>, connecté à ton compte TTFL : le script te demande le code de
            synchronisation, colle-le.
          </li>
        </ol>
        <p className="muted small">
          Ensuite il tourne tout seul, au premier passage de la journée sur TTFL. Il lit les pages que tu vois déjà (page équipe,
          profil de chaque coéquipier, ton historique), une douzaine de pages une fois par jour, et n’envoie que des picks passés.
          Aucun mot de passe n’est lu ni envoyé. TTFL limite les usages automatisés dans ses CGU : prévenir TrashTalk
          (ttfl@trashtalk.co) est conseillé.
        </p>
      </details>

      <details>
        <summary>
          <strong>Sur téléphone Android (Termux), en arrière-plan</strong>
        </summary>
        <p>
          Chrome sur téléphone n’accepte pas les scripts. Cette version tourne dans l’appli <strong>Termux</strong>, toute seule
          en arrière-plan, une fois par jour, et te notifie à chaque relevé : réussi ou non.
        </p>
        <div className="notice warn">
          Elle se connecte à TTFL avec deux cookies « se souvenir de moi » de ton compte, <strong>TTFLmail</strong> et{' '}
          <strong>TTFLhash</strong>. Ils équivalent à ton identifiant : ne les partage avec personne, pas même ici. Ils expirent
          au bout d’environ 90 jours (tu seras prévenu), il faudra alors les recopier.
        </div>
        <ol className="steps">
          <li>
            Installe <strong>Termux</strong> et <strong>Termux:API</strong> depuis F-Droid (
            <a href="https://f-droid.org/packages/com.termux/" target="_blank" rel="noopener">
              Termux
            </a>
            ,{' '}
            <a href="https://f-droid.org/packages/com.termux.api/" target="_blank" rel="noopener">
              Termux:API
            </a>
            ) ou depuis{' '}
            <a href="https://github.com/termux/termux-app/releases" target="_blank" rel="noopener">
              GitHub
            </a>
            , <strong>pas depuis le Play Store</strong> : l’équipe Termux n’y publie plus, et les deux applis doivent venir de la
            même source. Pendant l’installation, Android ou Play Protect peut afficher « application conçue pour une ancienne
            version d’Android » : c’est normal pour Termux, choisis « Installer quand même ».
          </li>
          <li>
            Dans les réglages Android, pour ces deux applis : autorise les <strong>notifications</strong> et mets la batterie sur{' '}
            <strong>« sans restriction »</strong>, sinon Android arrête la tâche.
          </li>
          <li>
            Ouvre Termux, copie puis colle ces commandes. La première ligne met Termux à niveau : elle prend quelques minutes, et
            si elle pose une question sur des fichiers de configuration, appuie simplement sur Entrée.
            <CommandBlock text={termuxCommands} />
            Si Termux affiche « CANNOT LINK EXECUTABLE », la mise à niveau n’est pas passée : lance{' '}
            <code>pkg upgrade -y</code> puis <code>pkg reinstall -y nodejs</code>, et reprends à partir de la ligne{' '}
            <code>npm install</code>.
          </li>
          <li>
            Prépare les deux cookies de connexion. Dans{' '}
            <strong>Chrome</strong>, ouvre fantasy.trashtalk.co (connecté), touche la barre d’adresse, <strong>tape</strong>{' '}
            <code>javascript:</code> à la main (Chrome retire ce début quand on le colle), puis colle ceci et valide :
            <CommandBlock text={cookieSnippet} />
            Une fenêtre affiche un court texte <code>TTFLmail=…; TTFLhash=…</code> : touche-le, « tout sélectionner », « copier ».
            Sur ordinateur, ouvre la console (F12) et remplace <code>prompt('Copie ce texte', …)</code> par{' '}
            <code>copy(…)</code>.
          </li>
          <li>
            De retour dans Termux, lance la configuration :
            <CommandBlock text={setupCommand} />
            Elle te demande, sans les afficher, le code de synchronisation (ci-dessus), puis le texte copié à l’étape précédente.
            Colle-les, elle ne garde que ces deux cookies. Ensuite, copie un mot au hasard pour vider le presse-papiers.
          </li>
          <li>Le premier relevé part tout de suite : une notification ✔ ou ✘ confirme que tout fonctionne.</li>
        </ol>
        <p className="muted small">
          Ensuite, un relevé par jour à partir de l’heure choisie. Commandes utiles dans <code>~/ttfl-releve</code> :{' '}
          <code>node releve-termux.mjs status</code>, <code>node releve-termux.mjs run --force</code> (relever maintenant),{' '}
          <code>node releve-termux.mjs remove</code> (arrêter). Lecture seule sur TTFL, avec un petit délai entre les pages. TTFL
          limite les usages automatisés dans ses CGU : prévenir TrashTalk (ttfl@trashtalk.co) est conseillé.
        </p>
      </details>
    </section>
  )
}
