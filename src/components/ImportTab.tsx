import { useMemo, useState } from 'react'
import type { Member } from '../lib/availability'
import { parseHistory } from '../lib/parseHistory'
import { formatDayFr } from '../lib/dates'

interface Props {
  members: Member[]
  onImport: (name: string, picks: { date: string; player: string }[]) => void
  onRemove: (id: string) => void
}

export function ImportTab({ members, onImport, onRemove }: Props) {
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const [done, setDone] = useState<string>()
  const parsed = useMemo(() => parseHistory(text), [text])

  const paste = async () => {
    try {
      setText(await navigator.clipboard.readText())
      setDone(undefined)
    } catch {
      // permission refusée : l'utilisateur peut coller à la main dans la zone de texte
    }
  }

  const canImport = name.trim().length > 0 && parsed.picks.length > 0
  const submit = () => {
    onImport(name, parsed.picks)
    setDone(`${parsed.picks.length} picks importés pour ${name.trim()}.`)
    setText('')
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
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. Knicko" autoCapitalize="off" autoCorrect="off" />
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
          Importer
        </button>
        {done && <div className="notice ok">✓ {done}</div>}
      </section>

      <section className="card">
        <h2>Membres ({members.length})</h2>
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
              <button className="btn small" onClick={() => confirm(`Supprimer ${m.name} ?`) && onRemove(m.id)}>
                Supprimer
              </button>
            </li>
          ))}
        </ul>
        <p className="muted small">
          Les données restent sur cet appareil. La synchronisation entre les téléphones de l’équipe arrive à l’étape suivante.
        </p>
      </section>
    </>
  )
}
