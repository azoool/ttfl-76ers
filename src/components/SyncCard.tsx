import { useCallback, useEffect, useState } from 'react'
import type { TeamApi } from '../hooks/useTeam'
import type { SyncStatus } from '../lib/sync'
import { describeWhen, friendlyError, isMissingFunction } from '../lib/team'

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
  const scriptUrl = new URL('ttfl-releve.user.js', `${location.origin}${location.pathname}`).href

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
          <strong>Installer le relevé (une seule personne)</strong>
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
    </section>
  )
}
