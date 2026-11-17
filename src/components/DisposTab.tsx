import { useEffect, useMemo, useState } from 'react'
import { availabilityRows, type LockInfo, type Member } from '../lib/availability'
import { addDays, daysBetween, formatDayFr, parisToday } from '../lib/dates'
import { deckClosing } from '../lib/deck'
import { fetchNight, type Night } from '../lib/espn'
import { playerKey } from '../lib/ttfl'

type Load =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; night: Night }

const PAGE = 50

function injuryBadge(status: string): { label: string; cls: string } {
  const s = status.toLowerCase()
  if (s === 'out') return { label: 'Absent', cls: 'bad' }
  if (s.includes('day')) return { label: 'Incertain', cls: 'warn' }
  return { label: status, cls: 'muted' }
}

function lockLabel(info: LockInfo): string {
  if (info.state === 'picked') return 'pick du jour'
  if (info.daysLeft !== undefined) return `${info.daysLeft} j`
  return 'réservé'
}

export function DisposTab({ members, goImport }: { members: Member[]; goImport: () => void }) {
  const today = parisToday()
  const [date, setDate] = useState(today)
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [reload, setReload] = useState(0)
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set())
  const [query, setQuery] = useState('')
  const [onlyAll, setOnlyAll] = useState(false)
  const [hideOut, setHideOut] = useState(true)
  const [limit, setLimit] = useState(PAGE)

  useEffect(() => {
    let cancelled = false
    setLoad({ status: 'loading' })
    setLimit(PAGE)
    fetchNight(date)
      .then((night) => !cancelled && setLoad({ status: 'ok', night }))
      .catch((e) => !cancelled && setLoad({ status: 'error', message: e instanceof Error ? e.message : String(e) }))
    return () => {
      cancelled = true
    }
  }, [date, reload])

  const active = useMemo(() => members.filter((m) => !excluded.has(m.id)), [members, excluded])

  const rows = useMemo(() => {
    if (load.status !== 'ok') return []
    const q = playerKey(query)
    return availabilityRows(active, load.night.candidates, date).filter((r) => {
      if (hideOut && r.candidate.injury?.status.toLowerCase() === 'out') return false
      if (onlyAll && !(r.total > 0 && r.freeCount === r.total)) return false
      if (q && !playerKey(r.candidate.name).includes(q)) return false
      return true
    })
  }, [load, active, date, query, onlyAll, hideOut])

  const toggle = (id: string) =>
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  // Un historique qui date de plus de 2 jours risque de fausser les disponibilités.
  const staleDays = (m: Member) => {
    const last = m.picks[0]?.date
    return last ? daysBetween(last, date < today ? date : today) : undefined
  }

  const games = load.status === 'ok' ? load.night.games : []

  return (
    <>
      <div className="datebar">
        <button className="btn icon" onClick={() => setDate(addDays(date, -1))} aria-label="Jour précédent">
          ‹
        </button>
        <div className="datebar-label">
          <strong>{formatDayFr(date)}</strong>
          {date !== today && (
            <button className="link" onClick={() => setDate(today)}>
              Revenir à aujourd’hui
            </button>
          )}
        </div>
        <button className="btn icon" onClick={() => setDate(addDays(date, 1))} aria-label="Jour suivant">
          ›
        </button>
      </div>

      {load.status === 'ok' && (
        <p className="muted small center">
          {games.length === 0
            ? 'Aucun match ce jour-là.'
            : `${games.length} match${games.length > 1 ? 's' : ''} · fermeture du deck à ${deckClosing(date, games)} (heure de Paris)`}
        </p>
      )}

      {members.length === 0 ? (
        <section className="card">
          <h2>Aucun historique pour l’instant</h2>
          <p>Importe l’historique d’un membre pour voir qui peut prendre quel joueur.</p>
          <button className="btn primary" onClick={goImport}>
            Importer un historique
          </button>
        </section>
      ) : (
        <>
          <div className="chips" role="group" aria-label="Membres comptés">
            {members.map((m) => {
              const stale = staleDays(m)
              const off = excluded.has(m.id)
              return (
                <button
                  key={m.id}
                  className={`chip toggle ${off ? 'off' : 'on'}`}
                  onClick={() => toggle(m.id)}
                  aria-pressed={!off}
                  title={m.picks[0] ? `Dernier pick connu : ${m.picks[0].date}` : 'Aucun pick'}
                >
                  {m.name}
                  {stale !== undefined && stale > 2 && <span aria-label="historique à mettre à jour"> ⚠️</span>}
                </button>
              )
            })}
          </div>
          {members.some((m) => (staleDays(m) ?? 99) > 2) && (
            <p className="muted small">⚠️ L’historique de ce membre a plus de 2 jours : ses disponibilités sont peut-être inexactes.</p>
          )}

          <div className="filters">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Chercher un joueur…"
              aria-label="Chercher un joueur"
            />
            <label className="check">
              <input type="checkbox" checked={onlyAll} onChange={(e) => setOnlyAll(e.target.checked)} />
              Dispo pour tous
            </label>
            <label className="check">
              <input type="checkbox" checked={hideOut} onChange={(e) => setHideOut(e.target.checked)} />
              Masquer les absents
            </label>
          </div>
        </>
      )}

      {load.status === 'loading' && <p className="center muted">Chargement des matchs…</p>}
      {load.status === 'error' && (
        <section className="card warn">
          <h2>Impossible de charger les matchs</h2>
          <p>{load.message}</p>
          <button className="btn" onClick={() => setReload((n) => n + 1)}>
            Réessayer
          </button>
        </section>
      )}

      {load.status === 'ok' && members.length > 0 && (
        <>
          <p className="muted small">{rows.length} joueur{rows.length > 1 ? 's' : ''}</p>
          <ul className="plain">
            {rows.slice(0, limit).map((r) => {
              const inj = r.candidate.injury ? injuryBadge(r.candidate.injury.status) : undefined
              const blocked = active.filter((m) => r.perMember[m.id].state !== 'free')
              return (
                <li key={`${r.candidate.teamId}-${r.candidate.name}`} className="player">
                  <div className="player-head">
                    <div>
                      <strong>{r.candidate.name}</strong>{' '}
                      <span className="muted">
                        {r.candidate.team}
                        {r.candidate.position ? ` · ${r.candidate.position}` : ''}
                      </span>
                    </div>
                    {inj && (
                      <span className={`badge ${inj.cls}`} title={r.candidate.injury?.comment}>
                        {inj.label}
                      </span>
                    )}
                  </div>
                  <div className="player-avail">
                    <span className={`pill ${r.freeCount === r.total ? 'ok' : r.freeCount === 0 ? 'none' : 'some'}`}>
                      {r.freeCount}/{r.total} dispo{r.freeCount > 1 ? 's' : ''}
                    </span>
                    {blocked.map((m) => (
                      <span key={m.id} className="chip small">
                        {m.name} · {lockLabel(r.perMember[m.id])}
                      </span>
                    ))}
                  </div>
                </li>
              )
            })}
          </ul>
          {rows.length > limit && (
            <button className="btn center-btn" onClick={() => setLimit((l) => l + PAGE)}>
              Voir plus ({rows.length - limit})
            </button>
          )}
        </>
      )}
    </>
  )
}
