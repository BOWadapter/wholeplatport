// Pruebas de aceptación PA-01…PA-08. Cada una corre sobre una simulación aislada y nueva
// (no toca el estado del usuario) y verifica el comportamiento real del motor.

import { answer } from './copilot'
import { ASSETS } from './sim/market'
import { MAX_EXPOSURE } from './risk/exposure'
import { createSim, currentDrawdown, DEFAULT_SEED, exposure, killSwitch, requestResume, setScenario, step, stepN, submitIntent, type SimState } from './engine'

export interface AcceptanceResult {
  id: string
  rule: string
  name: string
  passed: boolean
  detail: string
}

export interface AcceptanceTest {
  id: string
  rule: string
  name: string
  run: (seed: number) => { passed: boolean; detail: string }
}

/** Busca de forma recursiva cualquier campo con nombre de credencial. */
function findCredentialFields(obj: unknown, path = ''): string[] {
  if (!obj || typeof obj !== 'object') return []
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => {
    const here = /(api_?key|secret|password|token|credencial)/i.test(k) ? [`${path}${k}`] : []
    return [...here, ...findCredentialFields(v, `${path}${k}.`)]
  })
}

function runCrash(seed: number, maxTicks = 200): { s: SimState; tripTick: number | null } {
  let s = setScenario(createSim(seed), 'crash')
  for (let i = 0; i < maxTicks; i++) {
    s = step(s)
    if (s.breaker.status === 'disparado') return { s, tripTick: s.market.tick }
  }
  return { s, tripTick: null }
}

export const ACCEPTANCE_TESTS: AcceptanceTest[] = [
  {
    id: 'PA-01',
    rule: 'RN-1',
    name: 'Arranque demo solo en dry-run y sin campos de clave',
    run: (seed) => {
      const s = createSim(seed)
      const fields = findCredentialFields(s)
      const passed = s.mode === 'dry-run' && fields.length === 0 && s.breaker.status === 'armado'
      return { passed, detail: passed ? 'Modo dry-run, breaker armado, 0 campos de credenciales en el estado.' : `Modo ${s.mode}; campos sospechosos: ${fields.join(', ') || 'ninguno'}` }
    },
  },
  {
    id: 'PA-02',
    rule: 'RN-2',
    name: 'Cada orden tiene su decisión',
    run: (seed) => {
      const s = stepN(createSim(seed), 300)
      const byId = new Map(s.decisions.map((d) => [d.id, d]))
      const orphans = s.orders.filter((o) => byId.get(o.decisionId)?.orderId !== o.id)
      const executed = s.decisions.filter((d) => d.result === 'ejecutada').length
      const passed = s.orders.length > 0 && orphans.length === 0 && executed === s.orders.length
      return { passed, detail: `300 ticks: ${s.orders.length} órdenes, ${executed} decisiones ejecutadas, ${orphans.length} órdenes sin decisión (${s.decisions.length} decisiones en total).` }
    },
  },
  {
    id: 'PA-03',
    rule: 'RN-3',
    name: '"Caída tipo 2022" dispara el breaker y pausa ambos bots',
    run: (seed) => {
      const { s, tripTick } = runCrash(seed)
      const allPaused = s.strategies.every((st) => st.status === 'pausada')
      const ev = s.riskEvents.find((e) => e.type === 'circuit_breaker')
      const passed = tripTick !== null && allPaused && !!ev
      return {
        passed,
        detail: passed
          ? `Disparo en el tick ${tripTick} con drawdown ${(ev!.value * 100).toFixed(1)}% (umbral ${(ev!.threshold * 100).toFixed(0)}%). Estrategias pausadas: ${s.strategies.length}/${s.strategies.length}.`
          : `No se disparó en 200 ticks (drawdown máx. ${(s.maxDrawdown * 100).toFixed(1)}%).`,
      }
    },
  },
  {
    id: 'PA-04',
    rule: 'RN-4',
    name: 'Reanudar sin motivo o con drawdown sobre el umbral se rechaza',
    run: (seed) => {
      const { s } = runCrash(seed)
      if (s.breaker.status !== 'disparado') return { passed: false, detail: 'Requiere que PA-03 dispare el breaker.' }
      const noReason = requestResume(s, 'ok')
      const overThreshold = requestResume(s, 'Revisé el mercado y quiero reanudar')
      // Camino válido: kill switch con drawdown bajo y motivo suficiente.
      const k = killSwitch(stepN(createSim(seed), 5))
      const valid = requestResume(k, 'Prueba del taller terminada')
      const passed =
        !noReason.result.ok &&
        !overThreshold.result.ok &&
        overThreshold.state.strategies.every((st) => st.status === 'pausada') &&
        currentDrawdown(s) >= s.breaker.threshold &&
        valid.result.ok &&
        valid.state.strategies.every((st) => st.status === 'activa')
      return {
        passed,
        detail: `Sin motivo → "${noReason.result.message}" · Motivo válido con drawdown ${(currentDrawdown(s) * 100).toFixed(1)}% → "${overThreshold.result.message}" · Caso válido → "${valid.result.message}"`,
      }
    },
  },
  {
    id: 'PA-05',
    rule: 'RN-5',
    name: 'Kill switch pausa todo en el mismo tick',
    run: (seed) => {
      const before = stepN(createSim(seed), 30)
      const k = killSwitch(before)
      const ordersAtKill = k.orders.length
      const later = stepN(k, 48)
      const passed =
        k.market.tick === before.market.tick &&
        k.strategies.every((st) => st.status === 'pausada') &&
        later.orders.length === ordersAtKill
      return { passed, detail: `Kill switch en el tick ${k.market.tick}: ${k.strategies.filter((s) => s.status === 'pausada').length}/2 pausadas en ese tick; 48 ticks después, órdenes nuevas: ${later.orders.length - ordersAtKill}.` }
    },
  },
  {
    id: 'PA-06',
    rule: 'RN-6',
    name: 'Ninguna compra ejecutada deja un activo arriba de 60%',
    run: (seed) => {
      // 1) Operación normal durante 300 ticks: ninguna compra ejecutada puede rebasar 60%.
      const normal = stepN(createSim(seed), 300)
      // 2) Presión forzada desde un portafolio en efectivo: compras de 900 USDT en BTC.
      let s = createSim(seed)
      const ind = { rsi: 50, regime: 'normal' as const, volRatio: 1 }
      for (let i = 0; i < 5; i++) {
        for (const id of ['smart_dca', 'dynamic_grid'] as const) {
          s = submitIntent(s, id, { asset: 'BTC', side: 'compra', quote: 900, rule: 'Prueba PA-06: compra forzada', indicators: ind })
        }
      }
      s = { ...s, decisions: [...normal.decisions, ...s.decisions] }
      const executedBuys = s.decisions.filter((d) => d.result === 'ejecutada' && d.side === 'compra')
      const parse = (detail: string) => Number(/tras la compra: ([\d.]+)%/.exec(detail)?.[1] ?? NaN) / 100
      const violations = executedBuys.filter((d) => !(parse(d.detail) <= MAX_EXPOSURE + 1e-9))
      const rejected = s.decisions.filter((d) => d.result === 'rechazada por límite').length
      const btc = exposure(s).byAsset.BTC.pct
      const passed = violations.length === 0 && rejected > 0
      return { passed, detail: `${executedBuys.length} compras ejecutadas, ${violations.length} dejaron un activo sobre 60%; ${rejected} rechazadas por límite. Exposición final a BTC: ${(btc * 100).toFixed(1)}%.` }
    },
  },
  {
    id: 'PA-07',
    rule: 'RN-8',
    name: 'El copiloto no predice precios',
    run: (seed) => {
      const s = stepN(createSim(seed), 24)
      const qs = ['¿BTC va a subir?', '¿Debería comprar ETH?', '¿Cuánto va a valer XRP mañana?']
      const answers = qs.map((q) => answer(q, s))
      const passed = answers.every((a) => a.intent === 'sin_prediccion' && /no hago predicciones/i.test(a.text))
      return { passed, detail: `"${qs[0]}" → "${answers[0].text.slice(0, 90)}…" (${answers.filter((a) => a.intent === 'sin_prediccion').length}/${qs.length} rechazadas)` }
    },
  },
  {
    id: 'PA-08',
    rule: 'RN-9',
    name: 'Precio fuera de rango → reset del grid registrado',
    run: (seed) => {
      let s = setScenario(createSim(seed), 'crash')
      s = { ...s, breaker: { ...s.breaker, threshold: 0.25 } }
      s = stepN(s, 48)
      const resets = s.decisions.filter((d) => d.result === 'reset del grid')
      const internalResets = ASSETS.reduce((n, a) => n + (s.strategies.find((st) => st.id === 'dynamic_grid')!.internal.grids[a].resets as number), 0)
      const passed = resets.length > 0 && resets.length === internalResets
      return { passed, detail: `${resets.length} resets registrados en decisiones (${internalResets} en el estado del grid). Primero: ${resets[0] ? `${resets[0].asset} en el tick ${resets[0].tick}` : '—'}.` }
    },
  },
]

export function runAcceptance(id: string, seed = DEFAULT_SEED): AcceptanceResult {
  const t = ACCEPTANCE_TESTS.find((x) => x.id === id)
  if (!t) return { id, rule: '—', name: 'Desconocida', passed: false, detail: 'Prueba no encontrada.' }
  try {
    return { id: t.id, rule: t.rule, name: t.name, ...t.run(seed) }
  } catch (e) {
    return { id: t.id, rule: t.rule, name: t.name, passed: false, detail: `Error: ${(e as Error).message}` }
  }
}

export function runAllAcceptance(seed = DEFAULT_SEED): AcceptanceResult[] {
  return ACCEPTANCE_TESTS.map((t) => runAcceptance(t.id, seed))
}
