import type { Game, TeamRef } from './espn'

/** Adversaire d'une équipe ce jour-là. */
export interface Opponent {
  /** l'équipe d'en face */
  team: TeamRef
  /** l'équipe du joueur joue à domicile (« vs ») ; sinon elle se déplace (« @ ») */
  atHome: boolean
}

/** Pour chaque équipe qui joue ce jour-là (par identifiant ESPN), son adversaire et si elle reçoit ou se déplace. */
export function opponentsByTeam(games: Game[]): Map<string, Opponent> {
  const map = new Map<string, Opponent>()
  for (const g of games) {
    if (!map.has(g.home.id)) map.set(g.home.id, { team: g.away, atHome: true })
    if (!map.has(g.away.id)) map.set(g.away.id, { team: g.home, atHome: false })
  }
  return map
}

/** Symbole affiché devant le logo de l'adversaire : « vs » à domicile, « @ » à l'extérieur. */
export const matchupSymbol = (o: Opponent): string => (o.atHome ? 'vs' : '@')

/** Phrase lue par les lecteurs d'écran et affichée en infobulle : « À domicile contre Boston Celtics ». */
export const matchupLabel = (o: Opponent): string => `${o.atHome ? 'À domicile contre' : 'À l’extérieur chez'} ${o.team.name}`
