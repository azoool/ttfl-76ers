import type { Game } from './espn'

const timeFmt = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Paris',
  hourCycle: 'h23',
})
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' })

/** Heure de Paris d'un coup d'envoi, au format HH:mm. */
export function parisTime(startUtc: string): string {
  return timeFmt.format(new Date(startUtc))
}

/**
 * Heure de fermeture du deck (heure de Paris) : 00:00 par défaut, ou le coup d'envoi du premier
 * match s'il a lieu avant minuit (matchs du week-end, matinales…).
 */
export function deckClosing(date: string, games: Pick<Game, 'startUtc'>[]): string {
  let earliest: Date | undefined
  for (const g of games) {
    const start = new Date(g.startUtc)
    if (dayFmt.format(start) === date && (!earliest || start < earliest)) earliest = start
  }
  return earliest ? timeFmt.format(earliest) : '00:00'
}
