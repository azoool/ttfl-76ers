import { useState } from 'react'
import type { LockInfo, Member } from '../lib/availability'
import { fetchRecentGames } from '../lib/espn'
import { FORM_GAMES, formAverage, nextFormMode, type FormMode, type GameLine } from '../lib/form'
import { avgFormat, plural } from '../lib/format'
import type { RankedRow } from '../lib/groups'
import { matchupLabel, matchupSymbol, matchupTime, type Opponent } from '../lib/matchups'

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

interface Props {
  ranked: RankedRow
  /** membres comptés pour la disponibilité */
  active: Member[]
  favorite: boolean
  onToggleFavorite: () => void
  /** équipe du joueur, à afficher quand la liste mélange plusieurs équipes (favoris) */
  teamLabel?: string
  /** adversaire du jour : « vs » + logo à domicile, « @ » + logo à l'extérieur */
  opponent?: Opponent
}

type Recent = GameLine[] | 'loading' | 'error' | undefined

/** Ce que la case de moyenne affiche pour le mode choisi : valeur, légende et phrase d'aide. */
function averageView(mode: FormMode, stat: RankedRow['stat'], recent: Recent): { value: string; caption: string; title: string } {
  if (mode === 'season') {
    return {
      value: stat ? avgFormat.format(stat.avg) : '–',
      caption: stat ? plural(stat.gp, 'match', 'matchs') : 'moy. TTFL',
      title: stat
        ? `Moyenne TTFL : ${avgFormat.format(stat.avg)} points par match, sur ${plural(stat.gp, 'match joué', 'matchs joués')} cette saison`
        : 'Pas encore de match joué cette saison',
    }
  }
  const n = FORM_GAMES[mode]
  if (recent === 'loading' || recent === undefined) return { value: '…', caption: `${n} derniers`, title: 'Chargement des derniers matchs' }
  if (recent === 'error') return { value: '–', caption: 'indisponible', title: 'Impossible de charger les derniers matchs' }
  const f = formAverage(recent, n)
  if (!f) return { value: '–', caption: 'aucun match', title: 'Pas encore de match joué cette saison' }
  return {
    value: avgFormat.format(f.avg),
    caption: f.games === n ? `${n} derniers` : plural(f.games, 'match', 'matchs'),
    title: `Moyenne TTFL : ${avgFormat.format(f.avg)} points par match, sur ${plural(f.games, 'dernier match joué', 'derniers matchs joués')}`,
  }
}

export function PlayerRow({ ranked: { row: r, stat }, active, favorite, onToggleFavorite, teamLabel, opponent }: Props) {
  const inj = r.candidate.injury ? injuryBadge(r.candidate.injury.status) : undefined
  const blocked = active.filter((m) => r.perMember[m.id].state !== 'free')
  const name = r.candidate.name
  const [mode, setMode] = useState<FormMode>('season')
  const [recent, setRecent] = useState<Recent>(undefined)
  const view = averageView(mode, stat, recent)

  function cycleAverage() {
    const next = nextFormMode(mode)
    setMode(next)
    if (next !== 'season' && (recent === undefined || recent === 'error')) {
      const id = r.candidate.id
      if (!id) return setRecent('error')
      setRecent('loading')
      fetchRecentGames(id).then(setRecent, () => setRecent('error'))
    }
  }

  return (
    <li className="player">
      <div className="player-head">
        <button
          type="button"
          className={`star ${favorite ? 'on' : ''}`}
          aria-pressed={favorite}
          aria-label={favorite ? `Retirer ${name} des favoris` : `Ajouter ${name} aux favoris`}
          onClick={onToggleFavorite}
        >
          {favorite ? '★' : '☆'}
        </button>
        <div className="player-id">
          <strong>{name}</strong>
          {teamLabel && <span className="muted"> · {teamLabel}</span>}
          {r.candidate.position && <span className="muted"> · {r.candidate.position}</span>}
          {' '}
          {inj && (
            <span className={`badge ${inj.cls}`} title={r.candidate.injury?.comment}>
              {inj.label}
            </span>
          )}
          {opponent && (
            <div className="tonight" title={matchupLabel(opponent)}>
              Ce soir <span className="vs">{matchupSymbol(opponent)}</span>
              {opponent.team.logo ? (
                <img className="opp-logo" src={opponent.team.logo} alt={opponent.team.name} width={22} height={22} loading="lazy" />
              ) : null}
              <strong>{opponent.team.abbr}</strong>
              <span>· {matchupTime(opponent)}</span>
            </div>
          )}
        </div>
        <button
          type="button"
          className={`avg ${mode !== 'season' ? 'form' : ''}`}
          title={`${view.title} (toucher pour changer : saison, 10 derniers, 5 derniers)`}
          aria-label={`${view.value}, ${view.caption}. Changer la période de la moyenne`}
          onClick={cycleAverage}
        >
          <strong>{view.value}</strong>
          <small>{view.caption}</small>
        </button>
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
}
