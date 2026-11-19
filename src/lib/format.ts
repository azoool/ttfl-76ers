// `signDisplay: 'negative'` évite d'afficher « -0,0 » pour une moyenne à peine négative.
export const avgFormat = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: 'negative',
})

/** « 1 joueur », « 3 joueurs » */
export const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`
