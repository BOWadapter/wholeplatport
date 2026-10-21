// Motor de la simulación: une mercado, estrategias, riesgo y datos. Todas las funciones son puras:
// reciben un SimState y devuelven uno nuevo (la UI y las pruebas usan exactamente el mismo código).
//
// Capa 4 · Datos: orders, decisions y riskEvents son las tablas del esquema unificado (versión mínima).

import { ASSETS, createMarket, setScenario as marketSetScenario, stepMarket, type Asset, type MarketState, type Prices, type Scenario } from './sim/market'
import { emptyByAsset, strategyEquity, type OrderIntent, type Side, type StrategyId, type StrategyImpl, type StrategyState } from './strategies/base'
import { smartDca } from './strategies/smart-dca'
import { dynamicGrid } from './strategies/dynamic-grid'
import { aggregateExposure, exposureAfterBuy, MAX_EXPOSURE } from './risk/exposure'
import { canResume, clampThreshold, drawdown, shouldTrip, type BreakerState, type ResumeCheck } from './risk/circuit-breaker'
import type { VolRegime } from './indicators'

export const INITIAL_CAPITAL = 10_000
export const FEE_RATE = 0.001 // comisión simulada 0.1%
export const DEFAULT_SEED = 20261021

export const STRATEGIES: Record<StrategyId, StrategyImpl<any, any>> = {
  smart_dca: smartDca,
  dynamic_grid: dynamicGrid,
}

export type DecisionResult =
  | 'ejecutada'
  | 'rechazada por límite'
  | 'rechazada sin saldo'
  | 'rechazada sin posición'
  | 'reset del grid'
  | 'señal suprimida'

export interface Order {
  id: string
  tick: number
  strategyId: StrategyId
  asset: Asset
  side: Side
  price: number
  qty: number
  quote: number
  fee: number
  decisionId: string
}

export interface Decision {
  id: string
  tick: number
  strategyId: StrategyId
  asset: Asset
  side: Side | null
  price: number
  qty: number
  rsi: number
  regime: VolRegime
  volRatio: number
  rule: string
  result: DecisionResult
  detail: string
  orderId: string | null
}

export type RiskEventType = 'circuit_breaker' | 'kill_switch' | 'reanudacion' | 'reanudacion_rechazada' | 'cambio_umbral'

export interface RiskEvent {
  id: string
  tick: number
  type: RiskEventType
  threshold: number
  value: number
  action: string
}

export interface EquityPoint {
  tick: number
  equity: number
  hold: number
  drawdown: number
}

export interface SimState {
  version: 1
  /** RN-1: el único modo que existe. No hay modo live ni campos para credenciales. */
  mode: 'dry-run'
  seed: number
  market: MarketState
  strategies: StrategyState<any, any>[]
  orders: Order[]
  decisions: Decision[]
  riskEvents: RiskEvent[]
  equity: EquityPoint[]
  peak: number
  maxDrawdown: number
  breaker: BreakerState
  /** Cantidades de la línea base buy-and-hold (capital repartido en partes iguales en t0). */
  holdQty: Record<Asset, number>
  seq: number
}

const MAX_EQUITY_POINTS = 720

// ---------- creación ----------

export function createSim(seed = DEFAULT_SEED, scenario: Scenario = 'normal'): SimState {
  const market = createMarket(seed, scenario)
  const half = INITIAL_CAPITAL / 2
  const strategies = (['smart_dca', 'dynamic_grid'] as StrategyId[]).map((id) => {
    const impl = STRATEGIES[id]
    const params = { ...impl.defaultParams }
    return {
      id,
      name: impl.name,
      status: 'activa',
      initialCapital: half,
      cash: half,
      positions: emptyByAsset(),
      costBasis: emptyByAsset(),
      realizedPnl: 0,
      trades: 0,
      params,
      internal: impl.init(market, half, params),
    } satisfies StrategyState
  })
  const holdQty = {} as Record<Asset, number>
  for (const a of ASSETS) holdQty[a] = INITIAL_CAPITAL / ASSETS.length / market.prices[a]
  return {
    version: 1,
    mode: 'dry-run',
    seed,
    market,
    strategies,
    orders: [],
    decisions: [],
    riskEvents: [],
    equity: [{ tick: 0, equity: INITIAL_CAPITAL, hold: INITIAL_CAPITAL, drawdown: 0 }],
    peak: INITIAL_CAPITAL,
    maxDrawdown: 0,
    breaker: { status: 'armado', threshold: 0.1 },
    holdQty,
    seq: 0,
  }
}

// ---------- lecturas derivadas ----------

export function totalEquity(s: SimState, prices: Prices = s.market.prices): number {
  return s.strategies.reduce((sum, st) => sum + strategyEquity(st, prices), 0)
}

export function holdValue(s: SimState, prices: Prices = s.market.prices): number {
  return ASSETS.reduce((sum, a) => sum + s.holdQty[a] * prices[a], 0)
}

export function currentDrawdown(s: SimState): number {
  return drawdown(s.peak, totalEquity(s))
}

export function exposure(s: SimState) {
  return aggregateExposure(s.strategies, s.market.prices)
}

export function strategyPnl(st: StrategyState<any, any>, prices: Prices) {
  const equity = strategyEquity(st, prices)
  return { equity, pnl: equity - st.initialCapital, pnlPct: (equity - st.initialCapital) / st.initialCapital }
}

// ---------- ejecución de órdenes (RN-2, RN-6) ----------

function nextId(s: SimState, prefix: string): string {
  s.seq += 1
  return `${prefix}-${String(s.seq).padStart(5, '0')}`
}

/** Ejecuta (o rechaza) una intención. Siempre deja un registro en `decisions` (RN-2). Muta `s`. */
function execute(s: SimState, stIndex: number, intent: OrderIntent): void {
  const st = { ...s.strategies[stIndex], positions: { ...s.strategies[stIndex].positions }, costBasis: { ...s.strategies[stIndex].costBasis } }
  const price = s.market.prices[intent.asset]
  const decisionId = nextId(s, 'DEC')
  const base = {
    id: decisionId,
    tick: s.market.tick,
    strategyId: st.id,
    asset: intent.asset,
    side: intent.side,
    price,
    rsi: intent.indicators.rsi,
    regime: intent.indicators.regime,
    volRatio: intent.indicators.volRatio,
    rule: intent.rule,
  }
  const reject = (result: DecisionResult, detail: string) => {
    s.decisions.push({ ...base, qty: 0, result, detail, orderId: null })
  }

  let qty: number
  let quote: number
  if (intent.side === 'compra') {
    quote = Math.min(intent.quote, st.cash / (1 + FEE_RATE))
    if (quote < 1) return reject('rechazada sin saldo', `Efectivo disponible ${st.cash.toFixed(2)} USDT`)
    const after = exposureAfterBuy(aggregateExposure(s.strategies, s.market.prices), intent.asset, quote)
    if (after > MAX_EXPOSURE) {
      return reject('rechazada por límite', `Exposición a ${intent.asset} quedaría en ${(after * 100).toFixed(1)}% (máx. ${MAX_EXPOSURE * 100}%, RN-6)`)
    }
    qty = quote / price
    const fee = quote * FEE_RATE
    st.cash -= quote + fee
    st.positions[intent.asset] += qty
    st.costBasis[intent.asset] += quote + fee
    finish(fee, `Exposición a ${intent.asset} tras la compra: ${(after * 100).toFixed(1)}%`)
  } else {
    const held = st.positions[intent.asset]
    qty = Math.min(intent.quote / price, held)
    quote = qty * price
    if (quote < 1) return reject('rechazada sin posición', `Posición en ${intent.asset}: ${held.toFixed(6)}`)
    const fee = quote * FEE_RATE
    const costShare = held > 0 ? st.costBasis[intent.asset] * (qty / held) : 0
    st.cash += quote - fee
    st.positions[intent.asset] = held - qty
    st.costBasis[intent.asset] -= costShare
    st.realizedPnl += quote - fee - costShare
    finish(fee, `PnL realizado de la venta: ${(quote - fee - costShare).toFixed(2)} USDT`)
  }

  function finish(fee: number, detail: string) {
    const orderId = nextId(s, 'ORD')
    st.trades += 1
    s.orders.push({ id: orderId, tick: s.market.tick, strategyId: st.id, asset: intent.asset, side: intent.side, price, qty, quote, fee, decisionId })
    s.decisions.push({ ...base, qty, result: 'ejecutada', detail, orderId })
    s.strategies = s.strategies.map((x, i) => (i === stIndex ? st : x))
  }
}

/**
 * Envía una intención de orden directamente al motor, como si la estrategia la hubiera generado.
 * Pasa por los mismos controles (saldo, RN-6) y deja su decisión (RN-2). Lo usan las pruebas.
 */
export function submitIntent(prev: SimState, strategyId: StrategyId, intent: OrderIntent): SimState {
  const s: SimState = { ...prev, strategies: [...prev.strategies], orders: [...prev.orders], decisions: [...prev.decisions] }
  const i = s.strategies.findIndex((st) => st.id === strategyId)
  if (i >= 0) execute(s, i, intent)
  return s
}

// ---------- avance del tiempo ----------

export function step(prev: SimState): SimState {
  const s: SimState = {
    ...prev,
    market: stepMarket(prev.market),
    strategies: [...prev.strategies],
    orders: [...prev.orders],
    decisions: [...prev.decisions],
    riskEvents: [...prev.riskEvents],
    equity: [...prev.equity],
  }

  // Capa 2: cada estrategia activa decide; el motor ejecuta con control de riesgo.
  s.strategies.forEach((st, i) => {
    if (st.status !== 'activa' || s.breaker.status !== 'armado') return
    const out = STRATEGIES[st.id].onTick(st, s.market)
    s.strategies[i] = { ...s.strategies[i], internal: out.internal }
    for (const note of out.notes) {
      s.decisions.push({
        id: nextId(s, 'DEC'),
        tick: s.market.tick,
        strategyId: st.id,
        asset: note.asset,
        side: null,
        price: s.market.prices[note.asset],
        qty: 0,
        rsi: note.indicators.rsi,
        regime: note.indicators.regime,
        volRatio: note.indicators.volRatio,
        rule: note.rule,
        result: note.kind === 'reset_grid' ? 'reset del grid' : 'señal suprimida',
        detail: note.detail,
        orderId: null,
      })
    }
    for (const intent of out.intents) execute(s, i, intent)
  })

  // Capa 3: riesgo del portafolio agregado.
  const equity = totalEquity(s)
  s.peak = Math.max(s.peak, equity)
  const dd = drawdown(s.peak, equity)
  s.maxDrawdown = Math.max(s.maxDrawdown, dd)
  if (shouldTrip(s.breaker, dd)) {
    s.breaker = { ...s.breaker, status: 'disparado' }
    s.strategies = s.strategies.map((st) => ({ ...st, status: 'pausada' }))
    s.riskEvents.push({
      id: nextId(s, 'RSK'),
      tick: s.market.tick,
      type: 'circuit_breaker',
      threshold: s.breaker.threshold,
      value: dd,
      action: 'Pausa global de todas las estrategias',
    })
  }
  s.equity.push({ tick: s.market.tick, equity, hold: holdValue(s), drawdown: dd })
  if (s.equity.length > MAX_EQUITY_POINTS) s.equity = s.equity.slice(-MAX_EQUITY_POINTS)
  return s
}

export function stepN(s: SimState, n: number): SimState {
  let out = s
  for (let i = 0; i < n; i++) out = step(out)
  return out
}

// ---------- acciones de control ----------

export function setScenario(s: SimState, scenario: Scenario): SimState {
  return { ...s, market: marketSetScenario(s.market, scenario) }
}

/** RN-5: kill switch. Pausa todo en el mismo tick, sin importar el drawdown. */
export function killSwitch(s: SimState): SimState {
  const next = { ...s, riskEvents: [...s.riskEvents] }
  next.breaker = { ...s.breaker, status: 'kill_switch' }
  next.strategies = s.strategies.map((st) => ({ ...st, status: 'pausada' }))
  next.riskEvents.push({ id: nextId(next, 'RSK'), tick: s.market.tick, type: 'kill_switch', threshold: s.breaker.threshold, value: currentDrawdown(s), action: 'Kill switch: pausa inmediata' })
  return next
}

/** RN-4: reanudación con aprobación humana. Deja registro tanto si se aprueba como si se rechaza. */
export function requestResume(s: SimState, reason: string): { state: SimState; result: ResumeCheck } {
  const dd = currentDrawdown(s)
  const result = canResume(s.breaker, dd, reason)
  const next = { ...s, riskEvents: [...s.riskEvents] }
  if (s.breaker.status === 'armado') return { state: s, result }
  if (result.ok) {
    next.breaker = { ...s.breaker, status: 'armado' }
    next.strategies = s.strategies.map((st) => ({ ...st, status: 'activa' }))
    next.riskEvents.push({ id: nextId(next, 'RSK'), tick: s.market.tick, type: 'reanudacion', threshold: s.breaker.threshold, value: dd, action: `Reanudado. Motivo: ${reason.trim()}` })
  } else {
    next.riskEvents.push({ id: nextId(next, 'RSK'), tick: s.market.tick, type: 'reanudacion_rechazada', threshold: s.breaker.threshold, value: dd, action: result.message })
  }
  return { state: next, result }
}

export function setThreshold(s: SimState, threshold: number): SimState {
  const t = clampThreshold(threshold)
  const next = { ...s, breaker: { ...s.breaker, threshold: t }, riskEvents: [...s.riskEvents] }
  next.riskEvents.push({ id: nextId(next, 'RSK'), tick: s.market.tick, type: 'cambio_umbral', threshold: t, value: currentDrawdown(s), action: `Umbral del breaker: ${(t * 100).toFixed(0)}%` })
  return next
}

/** Pausar/reanudar una estrategia individual. No se puede activar con el breaker disparado. */
export function setStrategyStatus(s: SimState, id: StrategyId, status: 'activa' | 'pausada'): { state: SimState; error?: string } {
  if (status === 'activa' && s.breaker.status !== 'armado') {
    return { state: s, error: 'El breaker global está disparado: reanuda desde Riesgo con un motivo (RN-4).' }
  }
  return { state: { ...s, strategies: s.strategies.map((st) => (st.id === id ? { ...st, status } : st)) } }
}

export function setStrategyParam(s: SimState, id: StrategyId, key: string, value: number): { state: SimState; error?: string } {
  const spec = (STRATEGIES[id].paramSpec as Record<string, { min: number; max: number; label: string }>)[key]
  if (!spec) return { state: s, error: `Parámetro desconocido: ${key}` }
  if (!Number.isFinite(value) || value < spec.min || value > spec.max) {
    return { state: s, error: `${spec.label}: debe estar entre ${spec.min} y ${spec.max}` }
  }
  return { state: { ...s, strategies: s.strategies.map((st) => (st.id === id ? { ...st, params: { ...st.params, [key]: value } } : st)) } }
}
