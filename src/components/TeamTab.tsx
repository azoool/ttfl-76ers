import { useEffect, useState, type FormEvent } from 'react'
import type { Member } from '../lib/availability'
import { formatDayFr } from '../lib/dates'
import { syncConfigured } from '../lib/supabaseConfig'
import { friendlyError, inviteUrl, normalizeCode } from '../lib/team'
import type { TeamApi } from '../hooks/useTeam'

interface Props {
  team: TeamApi
  /** Code lu dans un lien d'invitation. */
  joinCode?: string
  /** Historique déjà importé sur cet appareil avant de rejoindre l'équipe. */
  localMembers: Member[]
}

const CONSENT = 'J’accepte que mes picks passés soient visibles par les membres de l’équipe.'

export function TeamTab({ team, joinCode, localMembers }: Props) {
  if (!syncConfigured) {
    return (
      <section className="card">
        <h2>Synchronisation non activée</h2>
        <p>L’appli fonctionne seule sur ce téléphone : les historiques importés ne sont pas partagés avec l’équipe.</p>
        <p className="muted small">Voir supabase/README.md pour activer la synchronisation.</p>
      </section>
    )
  }
  return team.link ? <InTeam team={team} /> : <NoTeam team={team} joinCode={joinCode} localMembers={localMembers} />
}

function NoTeam({ team, joinCode, localMembers }: Props) {
  const [code, setCode] = useState(joinCode ?? '')
  const [teamName, setTeamName] = useState('')
  const [pseudo, setPseudo] = useState(localMembers.length === 1 ? localMembers[0].name : '')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | undefined>(team.error)

  useEffect(() => {
    if (joinCode) setCode(joinCode)
  }, [joinCode])

  const mine = () => localMembers.find((m) => m.name.toLowerCase() === pseudo.trim().toLowerCase())?.picks

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setErr(undefined)
    try {
      await action()
    } catch (e) {
      setErr(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  const onJoin = (e: FormEvent) => {
    e.preventDefault()
    void run(() => team.join(normalizeCode(code), pseudo.trim(), mine()))
  }
  const onCreate = (e: FormEvent) => {
    e.preventDefault()
    void run(() => team.create(teamName.trim(), pseudo.trim(), mine()))
  }

  const ready = consent && pseudo.trim().length > 0 && !busy

  return (
    <>
      {err && <div className="notice bad">{err}</div>}

      <form className="card" onSubmit={onJoin}>
        <h2>Rejoindre mon équipe</h2>
        <p>Entre le code reçu de ton équipe (ou ouvre le lien d’invitation).</p>
        <label className="field">
          <span>Code d’invitation</span>
          <input value={code} onChange={(e) => setCode(normalizeCode(e.target.value))} placeholder="ABCD2345" maxLength={8} autoCapitalize="characters" autoCorrect="off" className="code-input" />
        </label>
        <label className="field">
          <span>Ton pseudo TTFL</span>
          <input value={pseudo} onChange={(e) => setPseudo(e.target.value)} placeholder="ex. Knicko" autoCapitalize="off" autoCorrect="off" maxLength={40} />
        </label>
        <label className="check">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          {CONSENT}
        </label>
        <button className="btn primary big" type="submit" disabled={!ready || code.length !== 8}>
          {busy ? 'Connexion…' : 'Rejoindre'}
        </button>
      </form>

      <details className="card">
        <summary>
          <strong>Créer une nouvelle équipe</strong>
        </summary>
        <form onSubmit={onCreate}>
          <label className="field">
            <span>Nom de l’équipe</span>
            <input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="ex. 76ersFR" maxLength={60} />
          </label>
          <p className="muted small">Tu rejoins avec le pseudo et l’accord saisis ci-dessus. Un code d’invitation est généré ensuite.</p>
          <button className="btn big" type="submit" disabled={!ready || teamName.trim().length === 0}>
            Créer l’équipe
          </button>
        </form>
      </details>
    </>
  )
}

function InTeam({ team }: { team: TeamApi }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>()
  const [busy, setBusy] = useState(false)
  const code = team.inviteCode ?? ''
  const url = inviteUrl(`${location.origin}${location.pathname}`, code)
  const canShare = typeof navigator.share === 'function'

  const run = async (okText: string, action: () => Promise<void>) => {
    setBusy(true)
    setMsg(undefined)
    try {
      await action()
      setMsg({ ok: true, text: okText })
    } catch (e) {
      setMsg({ ok: false, text: friendlyError(e) })
    } finally {
      setBusy(false)
    }
  }

  const share = async () => {
    try {
      await navigator.share({
        title: `Rejoins ${team.teamName ?? 'l’équipe'} sur TTFL`,
        text: `Rejoins l’équipe ${team.teamName ?? ''} : les joueurs disponibles de chacun pour chaque soirée TTFL.`,
        url,
      })
    } catch {
      // partage annulé
    }
  }
  const copy = () =>
    run('Lien copié.', async () => {
      await navigator.clipboard.writeText(url)
    })

  const at = team.syncedAt ? new Date(team.syncedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : undefined

  return (
    <>
      <section className="card">
        <h2>👥 {team.teamName}</h2>
        <p className="muted small">
          {team.status === 'loading' ? 'Synchronisation…' : at ? `À jour à ${at}` : 'Pas encore synchronisé'}
          {' · '}
          <button className="link" onClick={() => void team.refresh()}>
            Actualiser
          </button>
        </p>
        {team.error && <div className="notice bad">{team.error}</div>}
        <ul className="plain">
          {team.members.map((m) => (
            <li key={m.id} className="member-row">
              <div>
                <strong>{m.name}</strong> {m.me && <span className="badge ok">toi</span>}
                <div className="muted small">
                  {m.claimed ? '' : 'pas encore inscrit · '}
                  {m.picks.length} pick{m.picks.length > 1 ? 's' : ''} récents
                  {m.picks[0] ? ` · dernier le ${formatDayFr(m.picks[0].date)}` : ''}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Inviter un coéquipier</h2>
        <p>Il ouvre le lien, saisit son pseudo TTFL, et il est dans l’équipe.</p>
        <div className="code">{code}</div>
        <div className="row-actions">
          {canShare && (
            <button className="btn primary" onClick={share}>
              Partager le lien
            </button>
          )}
          <button className="btn" onClick={copy}>
            Copier le lien
          </button>
        </div>
        <button
          className="link"
          onClick={() => confirm('Changer le code ? L’ancien lien ne fonctionnera plus.') && void run('Nouveau code créé.', team.rotate)}
          disabled={busy}
        >
          Changer le code d’invitation
        </button>
      </section>

      <section className="card">
        <h2>Quitter l’équipe</h2>
        {msg && <div className={`notice ${msg.ok ? 'ok' : 'bad'}`}>{msg.text}</div>}
        <div className="row-actions">
          <button
            className="btn"
            disabled={busy}
            onClick={() => confirm('Quitter l’équipe ? Tes picks déjà partagés y restent.') && void run('', () => team.leave(false))}
          >
            Quitter
          </button>
          <button
            className="btn danger"
            disabled={busy}
            onClick={() =>
              confirm('Quitter ET supprimer tous tes picks partagés avec l’équipe ? Cette action est définitive.') &&
              void run('', () => team.leave(true))
            }
          >
            Quitter et tout supprimer
          </button>
        </div>
      </section>
    </>
  )
}
