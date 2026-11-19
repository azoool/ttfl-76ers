import { useEffect, useState, type FormEvent } from 'react'
import type { Member } from '../lib/availability'
import { formatDayFr } from '../lib/dates'
import { syncConfigured } from '../lib/supabaseConfig'
import {
  classifyPreviewError,
  friendlyError,
  inviteUrl,
  MAX_MEMBERS,
  MAX_NAME,
  normalizeCode,
  parseNames,
  splitPreviewMembers,
} from '../lib/team'
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

/** Valeur de la liste « Qui es-tu ? » pour quelqu'un qui n'y figure pas. */
const OTHER = '__autre__'

type PreviewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'list'; teamName: string; fresh: string[]; claimed: string[] }
  /** pas de liste (fonction absente, réseau…) : on saisit son pseudo à la main */
  | { status: 'manual'; warning?: string }
  | { status: 'unknown' }

function NoTeam({ team, joinCode, localMembers }: Props) {
  const { preview: loadPreview } = team
  // Si un seul historique a été importé sur cet appareil, c'est très probablement celui de la personne.
  const single = localMembers.length === 1 ? localMembers[0].name : ''

  const [code, setCode] = useState(joinCode ?? '')
  const [preview, setPreview] = useState<PreviewState>({ status: 'idle' })
  const [choice, setChoice] = useState('') // nom choisi dans la liste, ou OTHER
  const [typed, setTyped] = useState(single) // pseudo saisi à la main (pas de liste, ou « pas dans la liste »)
  const [consentJoin, setConsentJoin] = useState(false)
  const [teamName, setTeamName] = useState('')
  const [createPseudo, setCreatePseudo] = useState(single)
  const [consentCreate, setConsentCreate] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | undefined>(team.error)

  useEffect(() => {
    if (joinCode) setCode(joinCode)
  }, [joinCode])

  // Dès que le code est complet, on cherche l'équipe pour proposer la liste de ses membres.
  useEffect(() => {
    setChoice('')
    if (code.length !== 8) {
      setPreview({ status: 'idle' })
      return
    }
    let cancelled = false
    setPreview({ status: 'loading' })
    loadPreview(code)
      .then((p) => {
        if (cancelled) return
        const { fresh, claimed } = splitPreviewMembers(p.members)
        if (fresh.length + claimed.length === 0) {
          setPreview({ status: 'manual' })
          return
        }
        setPreview({ status: 'list', teamName: p.teamName, fresh, claimed })
        const mine = [...fresh, ...claimed].find((n) => single && n.toLowerCase() === single.toLowerCase())
        if (mine) setChoice(mine)
      })
      .catch((e) => {
        if (cancelled) return
        const kind = classifyPreviewError(e)
        if (kind === 'unknown-code') setPreview({ status: 'unknown' })
        else {
          setPreview({
            status: 'manual',
            warning: kind === 'other' ? `Impossible de charger la liste des membres (${friendlyError(e)})` : undefined,
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [code, loadPreview, single])

  const localPicks = (pseudo: string) => localMembers.find((m) => m.name.toLowerCase() === pseudo.toLowerCase())?.picks

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

  const joinPseudo = (preview.status === 'list' && choice !== OTHER ? choice : typed).trim()
  const choiceIsClaimed = preview.status === 'list' && preview.claimed.includes(choice)
  const hasIdentityStep = preview.status === 'list' || preview.status === 'manual'

  const onJoin = (e: FormEvent) => {
    e.preventDefault()
    void run(() => team.join(code, joinPseudo, localPicks(joinPseudo)))
  }
  const onCreate = (e: FormEvent) => {
    e.preventDefault()
    const pseudo = createPseudo.trim()
    void run(() => team.create(teamName.trim(), pseudo, localPicks(pseudo)))
  }

  // Dit pourquoi un bouton est grisé, au lieu de laisser deviner.
  const joinHint =
    !hasIdentityStep || busy
      ? undefined
      : preview.status === 'list' && !choice
        ? 'Choisis ton nom dans la liste.'
        : joinPseudo.length === 0
          ? 'Saisis ton pseudo TTFL.'
          : !consentJoin
            ? 'Coche la case d’accord.'
            : undefined
  const canJoin = code.length === 8 && hasIdentityStep && !joinHint && !busy

  const createHint =
    teamName.trim().length === 0
      ? 'Donne un nom à l’équipe.'
      : createPseudo.trim().length === 0
        ? 'Saisis ton pseudo TTFL.'
        : !consentCreate
          ? 'Coche la case d’accord.'
          : undefined
  const canCreate = !createHint && !busy

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

        {preview.status === 'loading' && <p className="muted">Recherche de l’équipe…</p>}
        {preview.status === 'unknown' && (
          <div className="notice bad">Code d’invitation inconnu. Vérifie le lien, ou demande un nouveau code à ton équipe.</div>
        )}

        {preview.status === 'list' && (
          <>
            <p>
              Équipe : <strong>{preview.teamName}</strong>
            </p>
            <label className="field">
              <span>Qui es-tu ?</span>
              <select value={choice} onChange={(e) => setChoice(e.target.value)}>
                <option value="" disabled>
                  Choisis ton nom…
                </option>
                {preview.fresh.length > 0 && (
                  <optgroup label="Pas encore inscrits">
                    {preview.fresh.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </optgroup>
                )}
                {preview.claimed.length > 0 && (
                  <optgroup label="Déjà inscrits (nouvel appareil)">
                    {preview.claimed.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </optgroup>
                )}
                <option value={OTHER}>Je ne suis pas dans la liste…</option>
              </select>
            </label>
            {choice === OTHER && (
              <label className="field">
                <span>Ton pseudo TTFL</span>
                <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="ex. Knicko" autoCapitalize="off" autoCorrect="off" maxLength={40} />
              </label>
            )}
            {choiceIsClaimed && (
              <div className="notice warn">
                {choice} est déjà utilisé sur un autre appareil. Si c’est bien toi, continue : tu reprends ce membre avec tous ses
                picks, et l’autre appareil sera déconnecté de l’équipe.
              </div>
            )}
          </>
        )}

        {preview.status === 'manual' && (
          <>
            {preview.warning && <p className="muted small">{preview.warning}</p>}
            <label className="field">
              <span>Ton pseudo TTFL</span>
              <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="ex. Knicko" autoCapitalize="off" autoCorrect="off" maxLength={40} />
            </label>
          </>
        )}

        {hasIdentityStep && (
          <label className="check">
            <input type="checkbox" checked={consentJoin} onChange={(e) => setConsentJoin(e.target.checked)} />
            {CONSENT}
          </label>
        )}

        <button className="btn primary big" type="submit" disabled={!canJoin}>
          {busy ? 'Connexion…' : 'Rejoindre'}
        </button>
        {joinHint && <p className="muted small">{joinHint}</p>}
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
          <label className="field">
            <span>Ton pseudo TTFL</span>
            <input value={createPseudo} onChange={(e) => setCreatePseudo(e.target.value)} placeholder="ex. Knicko" autoCapitalize="off" autoCorrect="off" maxLength={40} />
          </label>
          <label className="check">
            <input type="checkbox" checked={consentCreate} onChange={(e) => setConsentCreate(e.target.checked)} />
            {CONSENT}
          </label>
          <p className="muted small">Un code d’invitation est généré ensuite, à partager avec ton équipe.</p>
          <button className="btn big" type="submit" disabled={!canCreate}>
            {busy ? 'Création…' : 'Créer l’équipe'}
          </button>
          {createHint && <p className="muted small">{createHint}</p>}
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

  // Ajout de coéquipiers : ils apparaissent ensuite dans la liste « Qui es-tu ? » du lien d'invitation.
  const [names, setNames] = useState('')
  const [adding, setAdding] = useState(false)
  const [addMsg, setAddMsg] = useState<{ ok: boolean; text: string }>()
  const known = new Set(team.members.map((m) => m.name.toLowerCase()))
  const typed = parseNames(names)
  const toAdd = typed.filter((n) => !known.has(n.toLowerCase()))
  const tooLong = typed.find((n) => n.length > MAX_NAME)
  const addInfo =
    typed.length === 0
      ? undefined
      : tooLong
        ? `« ${tooLong.slice(0, 20)}… » dépasse ${MAX_NAME} caractères.`
        : team.members.length + toAdd.length > MAX_MEMBERS
          ? `Une équipe compte au plus ${MAX_MEMBERS} membres (${team.members.length} aujourd’hui).`
          : toAdd.length === 0
            ? 'Ils sont déjà tous dans l’équipe.'
            : `${toAdd.length} à ajouter${typed.length > toAdd.length ? `, ${typed.length - toAdd.length} déjà dans l’équipe` : ''}.`
  const canAdd = toAdd.length > 0 && !tooLong && team.members.length + toAdd.length <= MAX_MEMBERS && !adding

  const addMembers = async () => {
    setAdding(true)
    setAddMsg(undefined)
    try {
      await team.addMembers(toAdd)
      setAddMsg({ ok: true, text: `${toAdd.length} coéquipier${toAdd.length > 1 ? 's ajoutés' : ' ajouté'}.` })
      setNames('')
    } catch (e) {
      setAddMsg({ ok: false, text: friendlyError(e) })
    } finally {
      setAdding(false)
    }
  }

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

      <details className="card">
        <summary>
          <strong>Ajouter des coéquipiers</strong>
        </summary>
        <p className="muted small">
          Un pseudo TTFL par ligne. Ils apparaissent dans la liste « Qui es-tu ? » du lien d’invitation et chacun
          reprend sa place en la choisissant.
        </p>
        <textarea
          value={names}
          onChange={(e) => {
            setNames(e.target.value)
            setAddMsg(undefined)
          }}
          rows={5}
          placeholder={'Knicko\nHugues98\nJMdu31'}
          aria-label="Pseudos des coéquipiers à ajouter"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        {addInfo && <p className="muted small">{addInfo}</p>}
        {addMsg && <div className={`notice ${addMsg.ok ? 'ok' : 'bad'}`}>{addMsg.text}</div>}
        <button className="btn primary" disabled={!canAdd} onClick={() => void addMembers()}>
          {adding ? 'Ajout…' : toAdd.length > 1 ? `Ajouter ${toAdd.length} coéquipiers` : 'Ajouter'}
        </button>
      </details>

      <section className="card">
        <h2>Inviter un coéquipier</h2>
        <p>Il ouvre le lien, choisit son nom dans la liste des membres, et il est dans l’équipe.</p>
        <p className="muted small">
          Un coéquipier absent de la liste peut saisir son pseudo : ajoute-le plutôt ci-dessus pour éviter les fautes de
          frappe.
        </p>
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
