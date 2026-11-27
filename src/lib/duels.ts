import { addDays, daysBetween, formatDayFr, toUtcMs } from './dates'

/**
 * Jours de confrontation : chaque jour où les 76ers jouent en NBA, l'équipe TTFL 76ersFR affronte
 * l'équipe TTFL qui représente leur adversaire du jour.
 */

/** Identifiant ESPN des Philadelphia 76ers. */
export const SIXERS_ID = '20'

export interface Duel {
  /** jour NBA (YYYY-MM-DD, date de la côte Est), comme les dates de l'appli */
  date: string
  /** sigle de l'adversaire, ex. « IND » */
  abbr: string
  /** surnom de l'adversaire, ex. « Trail Blazers » */
  nickname: string
  /** les 76ers reçoivent */
  atHome: boolean
}

/** Ce qu'on lit de la réponse `teams/20/schedule` d'ESPN. */
export interface RawSchedule {
  events?: Array<{
    date: string
    competitions?: Array<{
      competitors?: Array<{
        homeAway?: string
        team: { id: string; abbreviation?: string; shortDisplayName?: string; displayName?: string }
      }>
      status?: { type?: { name?: string } }
    }>
  }>
}

/** Jour NBA d'un coup d'envoi : la date sur la côte Est (un match à 01:30 à Paris compte pour la veille). */
export const nbaDay = (utc: string): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(utc))

const NOT_PLAYED = new Set(['STATUS_POSTPONED', 'STATUS_CANCELED'])

/** Calendrier des 76ers → confrontations, de la plus ancienne à la plus lointaine. Lève une erreur si ESPN change le format. */
export function parseSchedule(raw: RawSchedule): Duel[] {
  const events = raw.events
  if (!Array.isArray(events)) throw new Error('Format du calendrier ESPN inattendu.')
  const duels: Duel[] = []
  let readable = 0
  for (const e of events) {
    const comp = e.competitions?.[0]
    const me = comp?.competitors?.find((c) => c.team.id === SIXERS_ID)
    const other = comp?.competitors?.find((c) => c.team.id !== SIXERS_ID)
    const abbr = other?.team.abbreviation
    const nickname = other?.team.shortDisplayName ?? other?.team.displayName
    if (!me || !abbr || !nickname) continue
    readable++
    if (NOT_PLAYED.has(comp?.status?.type?.name ?? '')) continue
    duels.push({ date: nbaDay(e.date), abbr, nickname, atHome: me.homeAway === 'home' })
  }
  if (events.length > 0 && readable === 0) throw new Error('Format du calendrier ESPN inattendu.')
  return duels.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

export const STRIP_DAYS = 7

/**
 * Les jours montrés par la frise : des semaines glissantes comptées à partir d'aujourd'hui.
 * Les cases ne bougent donc pas tant qu'on reste dans la même semaine.
 */
export function stripDays(date: string, today: string): string[] {
  const start = addDays(today, Math.floor(daysBetween(today, date) / STRIP_DAYS) * STRIP_DAYS)
  return Array.from({ length: STRIP_DAYS }, (_, i) => addDays(start, i))
}

/** « ven » pour la case d'un jour. */
export const weekdayShort = (date: string): string =>
  new Intl.DateTimeFormat('fr-FR', { weekday: 'short', timeZone: 'UTC' }).format(new Date(toUtcMs(date))).replace('.', '')

// Surnoms au singulier : on dit « le Heat », mais « les Pacers ».
const SINGULAR = new Set(['Heat', 'Jazz', 'Magic', 'Thunder'])

export const theTeam = (nickname: string): string => `${SINGULAR.has(nickname) ? 'le' : 'les'} ${nickname}`

/** Troisième ligne d'une case : « @IND » à l'extérieur, « MEM » à domicile, « – » sans confrontation. */
export const tileTag = (duel: Duel | undefined): string => (!duel ? '–' : duel.atHome ? duel.abbr : `@${duel.abbr}`)

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

/** Date du jour affiché, ex. « Ven. 27 nov. ». */
export const dayTitle = (date: string): string => capitalize(formatDayFr(date))

/** Phrase principale sous la frise, pour le jour affiché. */
export function duelHeadline(duel: Duel | undefined, date: string, today: string): string {
  const gap = daysBetween(today, date)
  const soon = gap === 0 ? 'ce soir' : gap === 1 ? 'demain' : undefined
  if (duel) return `${soon ? capitalize(soon) : dayTitle(date)} : confrontation contre ${theTeam(duel.nickname)}`
  return `Pas de confrontation ${soon ?? `le ${formatDayFr(date)}`}`
}

/** Seconde phrase : la confrontation qui vient après le jour affiché. */
export function duelFollowUp(duels: Duel[], date: string, today: string): string {
  const next = duels.find((d) => d.date > date)
  if (!next) return 'Aucune autre confrontation au calendrier pour l’instant'
  const gap = daysBetween(today, next.date)
  const when = gap === 0 ? 'ce soir' : gap === 1 ? 'demain' : `le ${formatDayFr(next.date)}`
  const lead = duels.some((d) => d.date === date) ? 'La suivante' : 'La prochaine'
  return `${lead} : ${when}, contre ${theTeam(next.nickname)}`
}
