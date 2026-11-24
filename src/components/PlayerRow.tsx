import type { LockInfo, Member } from '../lib/availability'
import { avgFormat, plural } from '../lib/format'
import type { RankedRow } from '../lib/groups'
import { matchupLabel, matchupSymbol, type Opponent } from '../lib/matchups'

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

export function PlayerRow({ ranked: { row: r, stat }, active, favorite, onToggleFavorite, teamLabel, opponent }: Props) {
  const inj = r.candidate.injury ? injuryBadge(r.candidate.injury.status) : undefined
  const blocked = active.filter((m) => r.perMember[m.id].state !== 'free')
  const name = r.candidate.name

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
          {opponent && (
            <>
              {' '}
              <span className="matchup" title={matchupLabel(opponent)}>
                <span className="vs">{matchupSymbol(opponent)}</span>
                {opponent.team.logo ? (
                  <img className="opp-logo" src={opponent.team.logo} alt={opponent.team.name} width={22} height={22} loading="lazy" />
                ) : (
                  <strong>{opponent.team.abbr}</strong>
                )}
              </span>
            </>
          )}{' '}
          {inj && (
            <span className={`badge ${inj.cls}`} title={r.candidate.injury?.comment}>
              {inj.label}
            </span>
          )}
        </div>
        <div
          className="avg"
          title={
            stat
              ? `Moyenne TTFL : ${avgFormat.format(stat.avg)} points par match, sur ${plural(stat.gp, 'match joué', 'matchs joués')} cette saison`
              : 'Pas encore de match joué cette saison'
          }
        >
          <strong>{stat ? avgFormat.format(stat.avg) : '–'}</strong>
          <small>{stat ? plural(stat.gp, 'match', 'matchs') : 'moy. TTFL'}</small>
        </div>
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
