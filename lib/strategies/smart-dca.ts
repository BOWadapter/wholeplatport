// Smart DCA: compra fija periódica + compras extra por RSI y Bollinger.
// RN-7: la señal de Bollinger se suprime cuando la volatilidad supera 1.5× su promedio.

import { ASSETS, type Asset } from '../sim/market'
import { bollinger, rsi, volRegime } from '../indicators'
import type { DecisionNote, IndicatorSnapshot, OrderIntent, StrategyImpl } from './base'

export interface SmartDcaParams {
  intervalo: number // ticks entre compras programadas
  monto: number // USDT por compra programada (se reparte entre los 3 activos)
  rsiCompra: number // umbral de RSI para compra extra
  montoExtra: number // USDT por compra extra
}

export interface SmartDcaInternal {
  /** Último tick con señal de RSI / Bollinger por activo (enfriamiento para no repetir cada hora). */
  lastExtra: Record<Asset, number>
  lastBollinger: Record<Asset, number>
}

const EXTRA_COOLDOWN = 12

export function snapshot(closes: number[]): IndicatorSnapshot {
  const { regime, ratio } = volRegime(closes)
  return { rsi: rsi(closes), regime, volRatio: ratio }
}

export const smartDca: StrategyImpl<SmartDcaParams, SmartDcaInternal> = {
  id: 'smart_dca',
  name: 'Smart DCA',
  defaultParams: { intervalo: 24, monto: 150, rsiCompra: 30, montoExtra: 100 },
  paramSpec: {
    intervalo: { label: 'Intervalo (ticks)', min: 1, max: 168, step: 1 },
    monto: { label: 'Monto programado (USDT)', min: 10, max: 1000, step: 10 },
    rsiCompra: { label: 'RSI de compra extra', min: 10, max: 50, step: 1 },
    montoExtra: { label: 'Monto extra (USDT)', min: 10, max: 1000, step: 10 },
  },
  init() {
    return { lastExtra: { BTC: -1e9, ETH: -1e9, XRP: -1e9 }, lastBollinger: { BTC: -1e9, ETH: -1e9, XRP: -1e9 } }
  },
  onTick(state, market) {
    const p = state.params
    const intents: OrderIntent[] = []
    const notes: DecisionNote[] = []
    const lastExtra = { ...state.internal.lastExtra }
    const lastBollinger = { ...state.internal.lastBollinger }
    const scheduled = market.tick % p.intervalo === 0

    for (const asset of ASSETS) {
      const closes = market.closes[asset]
      const ind = snapshot(closes)
      if (scheduled) {
        intents.push({ asset, side: 'compra', quote: p.monto / ASSETS.length, rule: 'DCA programado', indicators: ind })
      }
      // Señal 1: RSI en sobreventa.
      if (ind.rsi < p.rsiCompra && market.tick - lastExtra[asset] >= EXTRA_COOLDOWN) {
        intents.push({ asset, side: 'compra', quote: p.montoExtra, rule: `RSI < ${p.rsiCompra}`, indicators: ind })
        lastExtra[asset] = market.tick
      }
      // Señal 2: precio bajo la banda inferior de Bollinger, salvo en volatilidad alta (RN-7).
      const bands = bollinger(closes)
      if (market.prices[asset] < bands.lower && market.tick - lastBollinger[asset] >= EXTRA_COOLDOWN) {
        lastBollinger[asset] = market.tick
        if (ind.regime === 'alta') {
          notes.push({
            asset,
            kind: 'senal_suprimida',
            rule: 'Bollinger suprimida (RN-7)',
            detail: `Precio bajo la banda inferior, pero la volatilidad está en ${ind.volRatio.toFixed(2)}× su promedio (> 1.5×)`,
            indicators: ind,
          })
        } else {
          intents.push({ asset, side: 'compra', quote: p.montoExtra, rule: 'Precio < banda inferior de Bollinger', indicators: ind })
        }
      }
    }
    return { intents, notes, internal: { lastExtra, lastBollinger } }
  },
}
