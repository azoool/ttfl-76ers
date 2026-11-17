// Dates TTFL = "jours de matchs" au format YYYY-MM-DD (date NBA / heure de Paris à la fermeture du deck).
// On travaille en UTC pour que les écarts en jours ne soient jamais faussés par le changement d'heure.

const MS_DAY = 86_400_000

export function toUtcMs(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

/** Nombre de jours de `a` à `b` (positif si `b` est après `a`). */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / MS_DAY)
}

export function addDays(date: string, n: number): string {
  return new Date(toUtcMs(date) + n * MS_DAY).toISOString().slice(0, 10)
}

/** Date du jour à Paris (c'est la date du deck TTFL en cours). */
export function parisToday(now: Date = new Date()): string {
  // Le format "en-CA" donne YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(now)
}

export function formatDayFr(date: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(toUtcMs(date)))
}
