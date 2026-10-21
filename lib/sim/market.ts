// Capa 1 · Mercados (simulado). Precios con caminata aleatoria correlacionada y semilla fija.
// No hay conexión a ningún exchange (RN-1).

export type Asset = 'BTC' | 'ETH' | 'XRP'
export const ASSETS: Asset[] = ['BTC', 'ETH', 'XRP']

export type Scenario = 'normal' | 'lateral' | 'crash'
export const SCENARIOS: Record<Scenario, { label: string; description: string }> = {
  normal: { label: 'Mercado normal', description: 'Deriva ligeramente alcista con volatilidad moderada' },
  lateral: { label: 'Lateral', description: 'Sin tendencia; el precio oscila en rango' },
  crash: { label: 'Caída tipo 2022', description: '−30% en ~48 ticks y luego estabilización' },
}

export const INITIAL_PRICES: Record<Asset, number> = { BTC: 60000, ETH: 3000, XRP: 0.6 }

/** Volatilidad idiosincrática por tick (1 tick = 1 hora). */
const IDIO_VOL: Record<Asset, number> = { BTC: 0.0025, ETH: 0.0035, XRP: 0.005 }
/** Sensibilidad de cada activo al factor de mercado común (correlación). */
const BETA: Record<Asset, number> = { BTC: 1.0, ETH: 1.2, XRP: 1.4 }
const MARKET_VOL = 0.004
/** En la caída la volatilidad se multiplica, como en los desplomes reales. */
const CRASH_VOL_MULT = 2.2

/** Duración de la caída y rendimiento por tick para lograr ≈ −30% en 48 ticks. */
export const CRASH_TICKS = 48
const CRASH_DRIFT = Math.log(0.7) / CRASH_TICKS // ≈ −0.0074 por tick

export type Prices = Record<Asset, number>

export interface MarketState {
  tick: number
  prices: Prices
  /** Cierres por activo, del más antiguo al más reciente (incluye el actual). */
  closes: Record<Asset, number[]>
  scenario: Scenario
  /** Tick en el que se activó el escenario actual (la caída cuenta desde aquí). */
  scenarioStart: number
  /** Estado del PRNG para que la simulación sea reproducible. */
  rngState: number
}

/** PRNG mulberry32: determinista y suficiente para una simulación didáctica. */
export function nextRandom(state: number): [number, number] {
  let t = (state + 0x6d2b79f5) >>> 0
  let r = Math.imul(t ^ (t >>> 15), t | 1)
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61)
  return [((r ^ (r >>> 14)) >>> 0) / 4294967296, t]
}

/** Normal estándar con Box-Muller. */
function gaussian(state: number): [number, number] {
  const [u1, s1] = nextRandom(state)
  const [u2, s2] = nextRandom(s1)
  const z = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-12))) * Math.cos(2 * Math.PI * u2)
  return [z, s2]
}

/** Cuántos cierres se conservan (suficiente para indicadores de 100 periodos). */
const MAX_CLOSES = 300

export function createMarket(seed: number, scenario: Scenario = 'normal'): MarketState {
  return {
    tick: 0,
    prices: { ...INITIAL_PRICES },
    closes: { BTC: [INITIAL_PRICES.BTC], ETH: [INITIAL_PRICES.ETH], XRP: [INITIAL_PRICES.XRP] },
    scenario,
    scenarioStart: 0,
    rngState: seed >>> 0,
  }
}

function driftFor(m: MarketState, nextTick: number): number {
  if (m.scenario === 'crash') {
    const elapsed = nextTick - m.scenarioStart
    return elapsed <= CRASH_TICKS ? CRASH_DRIFT : 0
  }
  if (m.scenario === 'lateral') return 0
  return 0.0003
}

export function stepMarket(m: MarketState): MarketState {
  const tick = m.tick + 1
  let s = m.rngState
  let common: number
  ;[common, s] = gaussian(s)
  const drift = driftFor(m, tick)
  const inCrash = m.scenario === 'crash' && tick - m.scenarioStart <= CRASH_TICKS
  const volMult = inCrash ? CRASH_VOL_MULT : 1
  // En lateral se agrega reversión a la media para que el precio oscile en rango.
  const prices = { ...m.prices }
  const closes = { ...m.closes }
  for (const a of ASSETS) {
    let z: number
    ;[z, s] = gaussian(s)
    const meanReversion = m.scenario === 'lateral' ? -0.05 * Math.log(m.prices[a] / INITIAL_PRICES[a]) : 0
    const r = drift * BETA[a] + meanReversion + volMult * (BETA[a] * MARKET_VOL * common + IDIO_VOL[a] * z)
    prices[a] = Math.max(m.prices[a] * Math.exp(r), 1e-6)
    closes[a] = [...m.closes[a], prices[a]].slice(-MAX_CLOSES)
  }
  return { ...m, tick, prices, closes, rngState: s }
}

export function setScenario(m: MarketState, scenario: Scenario): MarketState {
  return { ...m, scenario, scenarioStart: m.tick }
}
