import { describe, expect, it } from 'vitest'
import { deckClosing } from '../src/lib/deck'

describe('deckClosing', () => {
  it('ferme à 00:00 quand tous les matchs ont lieu après minuit à Paris', () => {
    // 19h30 à New York = 01h30 à Paris le lendemain
    expect(deckClosing('2026-11-17', [{ startUtc: '2026-11-18T00:30Z' }])).toBe('00:00')
  })

  it('ferme au coup d’envoi du premier match s’il a lieu avant minuit', () => {
    expect(
      deckClosing('2026-11-22', [{ startUtc: '2026-11-22T20:00Z' }, { startUtc: '2026-11-22T18:00Z' }]),
    ).toBe('19:00')
  })

  it('ferme à 00:00 sans match', () => {
    expect(deckClosing('2026-11-17', [])).toBe('00:00')
  })
})
