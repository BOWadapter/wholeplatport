// Indicadores técnicos. RN-7: un indicador sin datos suficientes (NaN) devuelve un valor neutral.

export const NEUTRAL_RSI = 50

/** RSI de Wilder simplificado (promedio simple de ganancias/pérdidas). */
export function rsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return NEUTRAL_RSI
  let gains = 0
  let losses = 0
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1]
    if (diff >= 0) gains += diff
    else losses -= diff
  }
  if (gains === 0 && losses === 0) return NEUTRAL_RSI
  if (losses === 0) return 100
  const rs = gains / losses
  const value = 100 - 100 / (1 + rs)
  return Number.isFinite(value) ? value : NEUTRAL_RSI
}

export interface Bands {
  middle: number
  upper: number
  lower: number
}

/** Bandas de Bollinger. Sin datos suficientes devuelve bandas planas en el último precio (neutral). */
export function bollinger(closes: number[], period = 20, k = 2): Bands {
  const last = closes[closes.length - 1] ?? NaN
  if (closes.length < period) return { middle: last, upper: last, lower: last }
  const slice = closes.slice(-period)
  const mean = slice.reduce((a, b) => a + b, 0) / period
  const sd = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period)
  return { middle: mean, upper: mean + k * sd, lower: mean - k * sd }
}

/** Desviación estándar de rendimientos logarítmicos en una ventana. NaN si no hay datos. */
export function volatility(closes: number[], period = 20, endOffset = 0): number {
  const end = closes.length - endOffset
  const start = end - period - 1
  if (start < 0) return NaN
  const rets: number[] = []
  for (let i = start + 1; i < end; i++) rets.push(Math.log(closes[i] / closes[i - 1]))
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length
  return Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length)
}

export type VolRegime = 'normal' | 'alta'

/**
 * Régimen de volatilidad: 'alta' si la volatilidad actual (20) supera 1.5× el promedio
 * de las volatilidades de las últimas 60 ventanas. Sin datos: 'normal' (neutral, RN-7).
 */
export function volRegime(closes: number[], period = 20, lookback = 60, factor = 1.5): { regime: VolRegime; ratio: number } {
  const current = volatility(closes, period)
  const samples: number[] = []
  for (let off = 0; off < lookback; off++) {
    const v = volatility(closes, period, off)
    if (Number.isFinite(v)) samples.push(v)
  }
  if (!Number.isFinite(current) || samples.length < lookback / 2) return { regime: 'normal', ratio: 1 }
  const avg = samples.reduce((a, b) => a + b, 0) / samples.length
  const ratio = avg > 0 ? current / avg : 1
  return { regime: ratio > factor ? 'alta' : 'normal', ratio }
}
