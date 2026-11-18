import { useEffect, useMemo, useState } from 'react'
import type { Member } from '../lib/availability'
import { parseHistory, type Pick } from '../lib/parseHistory'
import { formatDayFr } from '../lib/dates'
import { friendlyError } from '../lib/team'

interface Props {
  members: Member[]
  onImport: (name: string, picks: Pick[]) => Promise<void> | void
  /** Absent en mode équipe : on ne supprime pas un coéquipier depuis ici. */
  onRemove?: (id: string) => void
  /** Mode équipe : nom de l'équipe et pseudo de la personne sur cet appareil. */
  teamName?: string
  myName?: string
}

export function ImportTab({ members, onImport, onRemove, teamName, myName }: Props) {
  const [name, setName] = useState(myName ?? '')
  const [text, setText] = useState('')
  const [done, setDone] = useState<string>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const parsed = useMemo(() => parseHistory(text), [text])

  // En équipe, le pseudo de l'appareil arrive après la première synchronisation.
  useEffect(() => {
    if (myName && !name) setName(myName)
  }, [myName, name])

  const paste = async () => {
    try {
      setText(await navigator.clipboard.readText())
      setDone(undefined)
    } catch {
      // permission refusée : l'utilisateur peut coller à la main dans la zone de texte
    }
  }

  const canImport = name.trim().length > 0 && parsed.picks.length > 0 && !busy
  const submit = async () => {
    setBusy(true)
    setError(undefined)
    try {
      await onImport(name.trim(), parsed.picks)
      setDone(`${parsed.picks.length} picks importés pour ${name.trim()}${teamName ? ` dans ${teamName}` : ''}.`)
      setText('')
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  const first = parsed.picks[parsed.picks.length - 1]
  const last = parsed.picks[0]

  return (
    <>
      <section className="card">
        <h2>Importer un historique</h2>
        <ol className="steps">
          <li>
            Ouvre{' '}
            <a href="https://fantasy.trashtalk.co/?tpl=historique" target="_blank" rel="noopener noreferrer">
              TTFL → Mes decks → Historique
            </a>
            .
          </li>
          <li>Sélectionne tout le tableau (<kbd>Ctrl</kbd>+<kbd>A</kbd>, ou appui long → « Tout sélectionner ») et copie.</li>
          <li>Reviens ici et colle-le ci-dessous.</li>
        </ol>

        <label className="field">
          <span>Pseudo TTFL du joueur</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex. Knicko"
            autoCapitalize="off"
            autoCorrect="off"
            list={teamName ? 'member-names' : undefined}
          />
          {teamName && <datalist id="member-names">{members.map((m) => <option key={m.id} value={m.name} />)}</datalist>}
        </label>

        <label className="field">
          <span>Tableau copié depuis TTFL</span>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setDone(undefined)
            }}
            rows={6}
            placeholder="2026-11-16  Yaxel Lendeborg  28  8  3 …"
          />
        </label>
        <div className="row-actions">
          <button className="btn" onClick={paste}>
            Coller depuis le presse-papiers
          </button>
        </div>

        {text.trim() && (
          <div className={parsed.picks.length ? 'notice ok' : 'notice bad'}>
            {parsed.picks.length ? (
              <>
                <strong>{parsed.picks.length} picks reconnus</strong> — du {formatDayFr(first.date)} au {formatDayFr(last.date)}.
              </>
            ) : (
              <>Aucun pick reconnu. Vérifie que tu as copié le tableau « Historique des decks ».</>
            )}
            {parsed.mismatches.length > 0 && (
              <div>⚠️ {parsed.mismatches.length} ligne(s) dont le score ne correspond pas à la formule TTFL.</div>
            )}
            {parsed.unknown.length > 0 && <div>{parsed.unknown.length} ligne(s) ignorée(s).</div>}
          </div>
        )}

        <button className="btn primary big" disabled={!canImport} onClick={submit}>
          {busy ? 'Envoi…' : teamName ? 'Importer dans l’équipe' : 'Importer'}
        </button>
        {error && <div className="notice bad">{error}</div>}
        {done && <div className="notice ok">✓ {done}</div>}
      </section>

      <section className="card">
        <h2>{teamName ? `Membres de ${teamName}` : 'Membres'} ({members.length})</h2>
        {members.length === 0 && <p className="muted">Personne pour l’instant. Importe le premier historique ci-dessus.</p>}
        <ul className="plain">
          {members.map((m) => (
            <li key={m.id} className="member-row">
              <div>
                <strong>{m.name}</strong>
                <div className="muted small">
                  {m.picks.length} picks{m.picks[0] ? ` · dernier le ${formatDayFr(m.picks[0].date)}` : ''}
                </div>
              </div>
              {onRemove && (
                <button className="btn small" onClick={() => confirm(`Supprimer ${m.name} ?`) && onRemove(m.id)}>
                  Supprimer
                </button>
              )}
            </li>
          ))}
        </ul>
        <p className="muted small">
          {teamName
            ? 'Ces picks sont partagés avec les membres de l’équipe.'
            : 'Les données restent sur cet appareil. Rejoins une équipe (onglet Équipe) pour les partager.'}
        </p>
      </section>
    </>
  )
}
