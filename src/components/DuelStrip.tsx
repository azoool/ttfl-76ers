import { useEffect, useState } from 'react'
import { addDays, formatDayFr } from '../lib/dates'
import { dayTitle, duelFollowUp, duelHeadline, stripDays, theTeam, tileTag, weekdayShort, type Duel } from '../lib/duels'
import { fetchSixersDuels } from '../lib/espn'

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ok'; duels: Duel[] }

interface Props {
  /** jour affiché */
  date: string
  today: string
  onSelect: (date: string) => void
}

/** Frise de sept jours qui met en évidence les confrontations TTFL, et sert à changer de jour. */
export function DuelStrip({ date, today, onSelect }: Props) {
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoad({ status: 'loading' })
    fetchSixersDuels().then(
      (duels) => !cancelled && setLoad({ status: 'ok', duels }),
      () => !cancelled && setLoad({ status: 'error' }),
    )
    return () => {
      cancelled = true
    }
  }, [reload])

  const duels = load.status === 'ok' ? load.duels : undefined
  const duelOn = (day: string) => duels?.find((d) => d.date === day)

  return (
    <>
      <div className="duelstrip" role="group" aria-label="Jours de confrontation">
        {stripDays(date, today).map((day) => {
          const duel = duelOn(day)
          const about = !duels ? '' : duel ? `, confrontation contre ${theTeam(duel.nickname)}` : ', pas de confrontation'
          return (
            <button
              key={day}
              type="button"
              className={`duelday ${duel ? 'duel' : ''} ${day === date ? 'selected' : ''}`}
              aria-pressed={day === date}
              aria-current={day === today ? 'date' : undefined}
              aria-label={`${formatDayFr(day)}${about}`}
              onClick={() => onSelect(day)}
            >
              <span>{weekdayShort(day)}</span>
              <strong>{Number(day.slice(8))}</strong>
              {/* tant que le calendrier n'est pas là, on n'annonce pas « pas de confrontation » */}
              <small>{duels ? tileTag(duel) : load.status === 'error' ? '?' : '…'}</small>
            </button>
          )
        })}
      </div>

      <div className="duelbar">
        <button type="button" className="btn icon" onClick={() => onSelect(addDays(date, -1))} aria-label="Jour précédent">
          ‹
        </button>
        <div className="duelbar-text" aria-live="polite">
          {duels ? (
            <>
              <strong>{duelHeadline(duelOn(date), date, today)}</strong>
              <span className="muted small">{duelFollowUp(duels, date, today)}</span>
            </>
          ) : (
            <>
              <strong>{dayTitle(date)}</strong>
              {load.status === 'loading' ? (
                <span className="muted small">Chargement du calendrier des 76ers…</span>
              ) : (
                <span className="muted small">
                  Calendrier des 76ers indisponible.{' '}
                  <button type="button" className="link" onClick={() => setReload((n) => n + 1)}>
                    Réessayer
                  </button>
                </span>
              )}
            </>
          )}
          {date !== today && (
            <button type="button" className="link" onClick={() => onSelect(today)}>
              Revenir à aujourd’hui
            </button>
          )}
        </div>
        <button type="button" className="btn icon" onClick={() => onSelect(addDays(date, 1))} aria-label="Jour suivant">
          ›
        </button>
      </div>
    </>
  )
}
