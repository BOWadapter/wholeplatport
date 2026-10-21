// Capa 2 · Ejecución. Interfaz común: cada estrategia recibe el contexto del tick y devuelve
// intenciones de orden + notas de decisión. La ejecución (y el control de riesgo) la hace el motor.

import type { Asset, MarketState } from '../sim/market'
import type { VolRegime } from '../indicators'

export type StrategyId = 'smart_dca' | 'dynamic_grid'
export type StrategyStatus = 'activa' | 'pausada'
export type Side = 'compra' | 'venta'

export interface IndicatorSnapshot {
  rsi: number
  regime: VolRegime
  volRatio: number
}

/** Orden que una estrategia quiere enviar. `quote` es el monto en USDT. */
export interface OrderIntent {
  asset: Asset
  side: Side
  quote: number
  rule: string
  indicators: IndicatorSnapshot
}

/** Evento de decisión que no es una orden (p. ej. reset del grid, señal suprimida). */
export interface DecisionNote {
  asset: Asset
  rule: string
  detail: string
  indicators: IndicatorSnapshot
  kind: 'reset_grid' | 'senal_suprimida'
}

export interface StrategyState<P = Record<string, number>, I = unknown> {
  id: StrategyId
  name: string
  status: StrategyStatus
  initialCapital: number
  cash: number
  positions: Record<Asset, number>
  /** Costo invertido neto por activo, para PnL realizado aproximado. */
  costBasis: Record<Asset, number>
  realizedPnl: number
  trades: number
  params: P
  internal: I
}

export interface StrategyOutput<I = unknown> {
  intents: OrderIntent[]
  notes: DecisionNote[]
  internal: I
}

export interface StrategyImpl<P, I> {
  id: StrategyId
  name: string
  defaultParams: P
  /** Rango permitido por parámetro, para la UI y para validar ediciones. */
  paramSpec: Record<keyof P & string, { label: string; min: number; max: number; step: number }>
  init(market: MarketState, capital: number, params: P): I
  onTick(state: StrategyState<P, I>, market: MarketState): StrategyOutput<I>
}

export const emptyByAsset = (): Record<Asset, number> => ({ BTC: 0, ETH: 0, XRP: 0 })

export function strategyEquity(s: StrategyState<any, any>, prices: Record<Asset, number>): number {
  return s.cash + (Object.keys(s.positions) as Asset[]).reduce((sum, a) => sum + s.positions[a] * prices[a], 0)
}
