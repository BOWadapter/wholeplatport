// Grid dinámico: niveles alrededor de un centro; compra al cruzar un nivel hacia abajo y vende al
// cruzarlo hacia arriba. RN-9: si el precio sale del rango, el grid se re-centra (reset dinámico)
// y el reset queda registrado como decisión. Un grid estático tiene valor esperado cero.

import { ASSETS, type Asset } from '../sim/market'
import type { DecisionNote, OrderIntent, StrategyImpl } from './base'
import { snapshot } from './smart-dca'

export interface DynamicGridParams {
  niveles: number // niveles a cada lado del centro
  paso: number // separación entre niveles, en %
}

export interface GridAsset {
  center: number
  level: number // nivel actual respecto al centro (…, -1, 0, 1, …)
  resets: number
}

export interface DynamicGridInternal {
  grids: Record<Asset, GridAsset>
  /** USDT por nivel y activo, fijado al iniciar o al re-centrar. */
  quotePerLevel: number
}

export function levelOf(price: number, center: number, pasoPct: number): number {
  const step = pasoPct / 100
  return Math.trunc(Math.log(price / center) / Math.log(1 + step))
}

export const dynamicGrid: StrategyImpl<DynamicGridParams, DynamicGridInternal> = {
  id: 'dynamic_grid',
  name: 'Grid dinámico',
  defaultParams: { niveles: 5, paso: 1 },
  paramSpec: {
    niveles: { label: 'Niveles por lado', min: 2, max: 10, step: 1 },
    paso: { label: 'Paso entre niveles (%)', min: 0.25, max: 5, step: 0.25 },
  },
  init(market, capital, params) {
    const grids = {} as Record<Asset, GridAsset>
    for (const a of ASSETS) grids[a] = { center: market.prices[a], level: 0, resets: 0 }
    return { grids, quotePerLevel: capital / ASSETS.length / params.niveles }
  },
  onTick(state, market) {
    const { niveles, paso } = state.params
    const intents: OrderIntent[] = []
    const notes: DecisionNote[] = []
    const grids = { ...state.internal.grids }

    for (const asset of ASSETS) {
      const g = { ...grids[asset] }
      const price = market.prices[asset]
      const ind = snapshot(market.closes[asset])
      const lvl = levelOf(price, g.center, paso)

      if (Math.abs(lvl) > niveles) {
        // RN-9: reset dinámico. Al romper el piso se conserva la cripto acumulada.
        notes.push({
          asset,
          kind: 'reset_grid',
          rule: 'Reset dinámico del grid (RN-9)',
          detail: `Precio ${lvl > 0 ? 'sobre' : 'bajo'} el rango (nivel ${lvl}); nuevo centro ${price.toFixed(4)}`,
          indicators: ind,
        })
        g.center = price
        g.level = 0
        g.resets += 1
      } else if (lvl < g.level) {
        intents.push({ asset, side: 'compra', quote: state.internal.quotePerLevel, rule: `Cruce de nivel ${g.level} → ${lvl} (baja)`, indicators: ind })
        g.level = lvl
      } else if (lvl > g.level) {
        intents.push({ asset, side: 'venta', quote: state.internal.quotePerLevel, rule: `Cruce de nivel ${g.level} → ${lvl} (sube)`, indicators: ind })
        g.level = lvl
      }
      grids[asset] = g
    }
    return { intents, notes, internal: { ...state.internal, grids } }
  },
}
