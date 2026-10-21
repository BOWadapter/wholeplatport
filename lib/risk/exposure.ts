// Exposición agregada por activo sobre TODAS las estrategias. RN-6: máximo 60% por activo.

import { ASSETS, type Asset, type Prices } from '../sim/market'
import { strategyEquity, type StrategyState } from '../strategies/base'

export const MAX_EXPOSURE = 0.6

export interface Exposure {
  total: number
  cash: number
  byAsset: Record<Asset, { qty: number; value: number; pct: number }>
  investedPct: number
}

export function aggregateExposure(strategies: StrategyState<any, any>[], prices: Prices): Exposure {
  const total = strategies.reduce((s, st) => s + strategyEquity(st, prices), 0)
  const cash = strategies.reduce((s, st) => s + st.cash, 0)
  const byAsset = {} as Exposure['byAsset']
  for (const a of ASSETS) {
    const qty = strategies.reduce((s, st) => s + st.positions[a], 0)
    const value = qty * prices[a]
    byAsset[a] = { qty, value, pct: total > 0 ? value / total : 0 }
  }
  return { total, cash, byAsset, investedPct: total > 0 ? 1 - cash / total : 0 }
}

/** RN-6: exposición del activo si se ejecutara una compra adicional de `quote` USDT. */
export function exposureAfterBuy(exp: Exposure, asset: Asset, quote: number): number {
  // Comprar no cambia el valor total (solo convierte efectivo en cripto).
  return exp.total > 0 ? (exp.byAsset[asset].value + quote) / exp.total : 1
}
