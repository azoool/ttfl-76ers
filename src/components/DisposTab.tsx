import { useEffect, useMemo, useState } from 'react'
import { availabilityRows, type Member } from '../lib/availability'
import { loadCounted, resolveCounted, saveCounted } from '../lib/counted'
import { daysBetween, parisToday } from '../lib/dates'
import { deckClosing } from '../lib/deck'
import { fetchNight, fetchSeasonStats, type Night } from '../lib/espn'
import {
  benchedFavorites,
  favoriteKey,
  favoriteRows,
  loadFavorites,
  removeFavorite,
  saveFavorites,
  splitByAvailability,
  toggleFavorite,
} from '../lib/favorites'
import { plural } from '../lib/format'
import { groupByTeam, type RankedRow } from '../lib/groups'
import { formPeriodText, nextFormMode, type FormMode } from '../lib/form'
import { opponentsByTeam } from '../lib/matchups'
import { indexStats, type StatsIndex } from '../lib/seasonStats'
import { playerKey } from '../lib/ttfl'
import { DuelStrip } from './DuelStrip'
import { PlayerRow } from './PlayerRow'

type Load =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; night: Night }

type StatsLoad =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; index: StatsIndex }

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e))

interface DisposProps {
  members: Member[]
  goImport: () => void
  /** membre de l'équipe qui correspond à la personne qui utilise l'appareil (son « profil ») */
  meId?: string
  /** clé de mémorisation du choix des membres comptés : équipe + identité sur l'appareil, ou « local » */
  scope: string
}

export function DisposTab({ members, goImport, meId, scope }: DisposProps) {
  const today = parisToday()
  const [date, setDate] = useState(today)
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [reload, setReload] = useState(0)
  const [stored, setStored] = useState<string[] | undefined>(() => loadCounted(scope))
  const [query, setQuery] = useState('')
  const [onlyAll, setOnlyAll] = useState(false)
  const [hideOut, setHideOut] = useState(true)
  const [stats, setStats] = useState<StatsLoad>({ status: 'loading' })
  const [statsReload, setStatsReload] = useState(0)
  const [open, setOpen] = useState<Set<string>>(() => new Set())
  const [favorites, setFavorites] = useState(loadFavorites)
  const [favOpen, setFavOpen] = useState(true)
  // Période des moyennes TTFL, commune à tous les joueurs.
  const [formMode, setFormMode] = useState<FormMode>('season')
  const cycleAverages = () => setFormMode(nextFormMode)

  useEffect(() => saveFavorites(favorites), [favorites])

  useEffect(() => {
    let cancelled = false
    setLoad({ status: 'loading' })
    fetchNight(date)
      .then((night) => !cancelled && setLoad({ status: 'ok', night }))
      .catch((e) => !cancelled && setLoad({ status: 'error', message: errorMessage(e) }))
    return () => {
      cancelled = true
    }
  }, [date, reload])

  // Les moyennes TTFL de la saison ne dépendent pas du jour : chargées une fois (puis en cache).
  useEffect(() => {
    let cancelled = false
    setStats({ status: 'loading' })
    fetchSeasonStats()
      .then((s) => !cancelled && setStats({ status: 'ok', index: indexStats(s) }))
      .catch((e) => !cancelled && setStats({ status: 'error', message: errorMessage(e) }))
    return () => {
      cancelled = true
    }
  }, [statsReload])

  // Profil : par défaut, seuls mes propres picks comptent ; le choix fait ensuite est mémorisé sur l'appareil.
  useEffect(() => setStored(loadCounted(scope)), [scope])
  const counted = useMemo(
    () => resolveCounted(members.map((m) => ({ id: m.id, me: m.id === meId })), stored),
    [members, meId, stored],
  )
  const active = useMemo(() => members.filter((m) => counted.has(m.id)), [members, counted])
  const setCounted = (ids: string[]) => {
    setStored(ids)
    saveCounted(scope, ids)
  }

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

  const statsIndex = stats.status === 'ok' ? stats.index : undefined
  const groups = useMemo(
    () => (load.status === 'ok' ? groupByTeam(rows, load.night.teams, statsIndex) : []),
    [load, rows, statsIndex],
  )

  const favKeys = useMemo(() => new Set(favorites.map((f) => f.key)), [favorites])
  // Favoris qui jouent ce jour-là (filtres compris), et favoris sans match ce jour-là.
  const favRows = useMemo(() => favoriteRows(rows, favKeys, statsIndex), [rows, favKeys, statsIndex])
  const benched = useMemo(
    () => (load.status === 'ok' ? benchedFavorites(favorites, load.night.candidates) : []),
    [load, favorites],
  )
  const teamAbbr = useMemo(
    () => new Map(load.status === 'ok' ? load.night.teams.map((t) => [t.id, t.abbr] as const) : []),
    [load],
  )
  // Adversaire du jour de chaque équipe (« vs » à domicile, « @ » à l'extérieur), affiché dans la case des favoris.
  const opponents = useMemo(() => opponentsByTeam(load.status === 'ok' ? load.night.games : []), [load])
  // Favoris disponibles / indisponibles pour les membres comptés (par défaut : moi).
  const { free: favFree, blocked: favBlocked } = useMemo(() => splitByAvailability(favRows), [favRows])
  const favList = (list: RankedRow[]) => (
    <ul className="plain">
      {list.map((ranked) => (
        <PlayerRow
          key={`${ranked.row.candidate.teamId}-${ranked.row.candidate.name}`}
          ranked={ranked}
          active={active}
          favorite
          onToggleFavorite={() => toggleFav(ranked.row.candidate)}
          teamLabel={teamAbbr.get(ranked.row.candidate.teamId ?? '') ?? ranked.row.candidate.team}
          opponent={opponents.get(ranked.row.candidate.teamId ?? '')}
          mode={formMode}
          onCycleAverage={cycleAverages}
        />
      ))}
    </ul>
  )

  // Pendant une recherche, toutes les équipes qui ont un résultat sont dépliées.
  const searching = query.trim() !== ''
  const allOpen = groups.length > 0 && groups.every((g) => open.has(g.id))

  const toggle = (id: string) => setCounted(counted.has(id) ? [...counted].filter((x) => x !== id) : [...counted, id])
  const countAll = () => setCounted(members.map((m) => m.id))
  const countOnlyMe = () => meId && setCounted([meId])

  const toggleTeam = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const toggleAllTeams = () => setOpen(allOpen ? new Set() : new Set(groups.map((g) => g.id)))

  const toggleFav = (c: Parameters<typeof toggleFavorite>[1]) => setFavorites((list) => toggleFavorite(list, c))

  // Un historique qui date de plus de 2 jours risque de fausser les disponibilités.
  const staleDays = (m: Member) => {
    const last = m.picks[0]?.date
    return last ? daysBetween(last, date < today ? date : today) : undefined
  }

  const games = load.status === 'ok' ? load.night.games : []

  return (
    <>
      <DuelStrip date={date} today={today} onSelect={setDate} />

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
              const off = !counted.has(m.id)
              return (
                <button
                  key={m.id}
                  className={`chip toggle ${off ? 'off' : 'on'}`}
                  onClick={() => toggle(m.id)}
                  aria-pressed={!off}
                  title={m.picks[0] ? `Dernier pick connu : ${m.picks[0].date}` : 'Aucun pick'}
                >
                  {m.name}
                  {m.id === meId && <span className="chip-me"> · toi</span>}
                  {stale !== undefined && stale > 2 && <span aria-label="historique à mettre à jour"> ⚠️</span>}
                </button>
              )
            })}
          </div>
          {members.length > 1 && (
            <div className="chips-actions">
              {meId && (
                <button className="link" onClick={countOnlyMe}>
                  Moi seul
                </button>
              )}
              <button className="link" onClick={countAll}>
                Toute l’équipe
              </button>
            </div>
          )}
          {active.some((m) => (staleDays(m) ?? 99) > 2) && (
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

      {load.status === 'ok' && members.length > 0 && stats.status === 'loading' && (
        <p className="center muted">Chargement des moyennes TTFL…</p>
      )}
      {load.status === 'ok' && members.length > 0 && stats.status === 'error' && (
        <section className="card warn">
          <h2>Moyennes TTFL indisponibles</h2>
          <p>{stats.message}</p>
          <p className="muted small">Les joueurs restent listés, par ordre alphabétique.</p>
          <button className="btn" onClick={() => setStatsReload((n) => n + 1)}>
            Réessayer
          </button>
        </section>
      )}

      {load.status === 'ok' && members.length > 0 && stats.status !== 'loading' && (
        <>
          <div className="listbar">
            <p className="muted small">
              {plural(rows.length, 'joueur', 'joueurs')} · {plural(groups.length, 'équipe', 'équipes')}
            </p>
            {!searching && groups.length > 1 && (
              <button className="link" onClick={toggleAllTeams}>
                {allOpen ? 'Tout replier' : 'Tout déplier'}
              </button>
            )}
          </div>
          {statsIndex && (
            <p className="muted small">
              Moyenne TTFL : points TTFL par match {formPeriodText(formMode, statsIndex.season)} (stats ESPN). Touche une
              moyenne pour changer la période de tous les joueurs.{formMode !== 'season' && ' Les listes restent classées sur la saison.'}
            </p>
          )}

          <section className="team fav">
            <button type="button" className="team-head" aria-expanded={favOpen} onClick={() => setFavOpen((o) => !o)}>
              <span className="team-logo star-badge" aria-hidden="true">
                ★
              </span>
              <span className="team-name">Favoris</span>
              <span className="muted small">
                {active.length > 0
                  ? `${favFree.length} dispo · ${favBlocked.length} indispo`
                  : plural(favRows.length, 'joueur', 'joueurs')}
              </span>
              <span className="chev" aria-hidden="true">
                ▾
              </span>
            </button>

            {favOpen && (
              <>
                {favRows.length === 0 ? (
                  <p className="muted small fav-empty">
                    {favorites.length === 0
                      ? 'Touche l’étoile ☆ à côté d’un joueur, dans les équipes ci-dessous, pour le retrouver ici.'
                      : 'Aucun de tes favoris ne correspond aux filtres ou ne joue ce jour-là.'}
                  </p>
                ) : active.length === 0 ? (
                  favList(favRows)
                ) : (
                  <>
                    <h3 className="fav-sub ok">Disponibles · {favFree.length}</h3>
                    {favFree.length > 0 ? (
                      favList(favFree)
                    ) : (
                      <p className="muted small fav-empty">Aucun de tes favoris n’est disponible ce jour-là.</p>
                    )}
                    <h3 className="fav-sub bad">Indisponibles · {favBlocked.length}</h3>
                    {favBlocked.length > 0 ? (
                      favList(favBlocked)
                    ) : (
                      <p className="muted small fav-empty">Aucun de tes favoris n’est indisponible.</p>
                    )}
                    {active.length > 1 && (
                      <p className="muted small">Disponible = libre pour les {active.length} membres comptés.</p>
                    )}
                  </>
                )}
                {benched.length > 0 && (
                  <div className="fav-benched">
                    <span className="muted small">Pas de match ce jour-là :</span>
                    {benched.map((f) => (
                      <button
                        key={f.key}
                        type="button"
                        className="chip small"
                        aria-label={`Retirer ${f.name} des favoris`}
                        onClick={() => setFavorites((list) => removeFavorite(list, f.key))}
                      >
                        {f.name} ✕
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>

          {groups.map((g) => {
            const isOpen = searching || open.has(g.id)
            return (
              <section key={g.id} className="team">
                <button
                  type="button"
                  className="team-head"
                  aria-expanded={isOpen}
                  onClick={() => !searching && toggleTeam(g.id)}
                >
                  {g.logo ? (
                    <img className="team-logo" src={g.logo} alt="" width={32} height={32} loading="lazy" />
                  ) : (
                    <span className="team-logo ph" aria-hidden="true">
                      {g.abbr}
                    </span>
                  )}
                  <span className="team-name">{g.name}</span>
                  <span className="muted small">{plural(g.rows.length, 'joueur', 'joueurs')}</span>
                  <span className="chev" aria-hidden="true">
                    ▾
                  </span>
                </button>

                {isOpen && (
                  <ul className="plain">
                    {g.rows.map((ranked) => (
                      <PlayerRow
                        key={`${ranked.row.candidate.teamId}-${ranked.row.candidate.name}`}
                        ranked={ranked}
                        active={active}
                        favorite={favKeys.has(favoriteKey(ranked.row.candidate))}
                        onToggleFavorite={() => toggleFav(ranked.row.candidate)}
                        mode={formMode}
                        onCycleAverage={cycleAverages}
                      />
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
        </>
      )}
    </>
  )
}
