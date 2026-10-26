// Funciones puras para guardar y restaurar corridas: validación del estado recibido y resumen.

import { totalEquity, INITIAL_CAPITAL, type SimState } from '../engine'
import { ASSETS } from '../sim/market'

export const MAX_STATE_BYTES = 5_000_000
export const MAX_RUNS_PER_USER = 50

export interface RunSummary {
  id: number
  name: string
  seed: number
  scenario: SimState['market']['scenario']
  tick: number
  equity: number
  pnl: number
  maxDrawdown: number
  breakerStatus: SimState['breaker']['status']
  orders: number
  decisions: number
  riskEvents: number
  updatedAt: string
}

const SCENARIOS = new Set(['normal', 'lateral', 'crash'])
const BREAKER = new Set(['armado', 'disparado', 'kill_switch'])
const STRATEGY_IDS = new Set(['smart_dca', 'dynamic_grid'])

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Revisa que un JSON recibido tenga la forma de un SimState de esta versión. Devuelve el error o null. */
export function validateSimState(value: unknown): string | null {
  if (!isObj(value)) return 'El estado debe ser un objeto.'
  if (value.version !== 1) return 'Versión de estado no soportada.'
  if (value.mode !== 'dry-run') return 'Solo se aceptan corridas en dry-run (RN-1).'
  if (!isNum(value.seed) || !isNum(value.peak) || !isNum(value.maxDrawdown) || !isNum(value.seq)) {
    return 'Faltan campos numéricos del estado.'
  }
  const m = value.market
  if (!isObj(m) || !isNum(m.tick) || m.tick < 0 || !SCENARIOS.has(m.scenario as string)) return 'Mercado inválido.'
  if (!isObj(m.prices) || !ASSETS.every((a) => isNum((m.prices as Record<string, unknown>)[a]))) {
    return 'Precios inválidos.'
  }
  if (!isObj(value.breaker) || !BREAKER.has(value.breaker.status as string) || !isNum(value.breaker.threshold)) {
    return 'Estado del breaker inválido.'
  }
  const strategies = value.strategies
  if (
    !Array.isArray(strategies) ||
    strategies.length !== 2 ||
    !strategies.every((s) => isObj(s) && STRATEGY_IDS.has(s.id as string) && isNum(s.cash) && isObj(s.positions))
  ) {
    return 'Estrategias inválidas.'
  }
  for (const key of ['orders', 'decisions', 'riskEvents', 'equity'] as const) {
    if (!Array.isArray(value[key])) return `Falta la lista ${key}.`
  }
  return null
}

export function summarize(sim: SimState) {
  const equity = totalEquity(sim)
  return {
    seed: sim.seed,
    scenario: sim.market.scenario,
    tick: sim.market.tick,
    equity,
    pnl: equity - INITIAL_CAPITAL,
    maxDrawdown: sim.maxDrawdown,
    breakerStatus: sim.breaker.status,
    orders: sim.orders.length,
    decisions: sim.decisions.length,
    riskEvents: sim.riskEvents.length,
  }
}

/** Normaliza el nombre de la corrida: sin espacios sobrantes, 1–80 caracteres. */
export function cleanRunName(name: unknown): string | null {
  if (typeof name !== 'string') return null
  const clean = name.replace(/\s+/g, ' ').trim()
  return clean.length >= 1 && clean.length <= 80 ? clean : null
}
