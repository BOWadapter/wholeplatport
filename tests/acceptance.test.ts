// npm test · Corre PA-01…PA-08 con varias semillas para comprobar que no dependen de la suerte.
import { describe, expect, it } from 'vitest'
import { ACCEPTANCE_TESTS, runAcceptance } from '../lib/acceptance'
import { rsi, NEUTRAL_RSI, volRegime } from '../lib/indicators'
import { canResume } from '../lib/risk/circuit-breaker'

const SEEDS = [20261021, 1, 42, 7, 2022]

describe('Pruebas de aceptación', () => {
  for (const t of ACCEPTANCE_TESTS) {
    for (const seed of SEEDS) {
      it(`${t.id} (${t.rule}) · semilla ${seed}`, () => {
        const r = runAcceptance(t.id, seed)
        expect(r.passed, r.detail).toBe(true)
      })
    }
  }
})

describe('RN-7 · indicadores robustos', () => {
  it('RSI sin datos suficientes devuelve valor neutral', () => {
    expect(rsi([100, 101])).toBe(NEUTRAL_RSI)
    expect(rsi([])).toBe(NEUTRAL_RSI)
  })
  it('régimen de volatilidad sin datos es normal', () => {
    expect(volRegime([1, 2, 3]).regime).toBe('normal')
  })
})

describe('RN-4 · reglas puras del breaker', () => {
  const b = { status: 'disparado' as const, threshold: 0.1 }
  it('motivo corto se rechaza', () => expect(canResume(b, 0.01, 'corto').ok).toBe(false))
  it('drawdown en el umbral se rechaza', () => expect(canResume(b, 0.1, 'motivo suficiente').ok).toBe(false))
  it('motivo válido y drawdown bajo se aprueba', () => expect(canResume(b, 0.05, 'motivo suficiente').ok).toBe(true))
})
