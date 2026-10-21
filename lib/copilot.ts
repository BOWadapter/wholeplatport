// Capa 5 · Inteligencia. Copiloto determinista por plantillas: explica y resume el estado.
// RN-8: nunca predice precios ni recomienda comprar o vender.

import { ASSETS } from './sim/market'
import { currentDrawdown, exposure, holdValue, strategyPnl, totalEquity, INITIAL_CAPITAL, type SimState } from './engine'

export type CopilotIntent = 'sin_prediccion' | 'resumen' | 'pausa' | 'estrategias' | 'exposicion' | 'decisiones' | 'ayuda'

export interface CopilotAnswer {
  intent: CopilotIntent
  text: string
}

export const SUGGESTED_QUESTIONS = [
  'Dame un resumen del portafolio',
  '¿Por qué se pausaron las estrategias?',
  '¿Qué estrategia aporta más?',
  '¿Cómo está la exposición?',
  '¿Qué decisiones se tomaron hoy?',
  '¿BTC va a subir?',
]

const PREDICTION = /(va a (subir|bajar)|subir[aá]|bajar[aá]|predic|pron[oó]stic|precio (de )?ma[ñn]ana|cu[aá]nto (va a )?valer|deber[ií]a (comprar|vender)|compro|vendo|recomiend|conviene (comprar|vender)|target|objetivo de precio)/i

export function classify(question: string): CopilotIntent {
  const q = question.toLowerCase()
  if (PREDICTION.test(q)) return 'sin_prediccion'
  if (/(paus|breaker|detuv|par[oó]|kill|disparo|dispar)/.test(q)) return 'pausa'
  if (/(estrateg|aporta|mejor|peor|dca|grid)/.test(q)) return 'estrategias'
  if (/(exposici|riesgo|concentr|activo)/.test(q)) return 'exposicion'
  if (/(decisi|operaci|trade|orden|hoy)/.test(q)) return 'decisiones'
  if (/(resum|portafolio|c[oó]mo vamos|estado|pnl)/.test(q)) return 'resumen'
  return 'ayuda'
}

const usd = (n: number) => `${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`
const pct = (n: number) => `${(n * 100).toFixed(1)}%`

export function answer(question: string, s: SimState): CopilotAnswer {
  const intent = classify(question)
  const eq = totalEquity(s)
  const dd = currentDrawdown(s)

  switch (intent) {
    case 'sin_prediccion':
      return {
        intent,
        text:
          'No hago predicciones de precio ni recomiendo comprar o vender (RN-8). Puedo explicarte qué está pasando ahora: ' +
          `el portafolio vale ${usd(eq)}, con drawdown de ${pct(dd)} y breaker ${s.breaker.status}. ` +
          'Pregúntame por el resumen, la exposición o por qué se tomó una decisión.',
      }
    case 'resumen': {
      const pnl = eq - INITIAL_CAPITAL
      const hold = holdValue(s)
      return {
        intent,
        text:
          `Tick ${s.market.tick}. Valor total ${usd(eq)} (${pnl >= 0 ? '+' : ''}${usd(pnl)}, ${pct(pnl / INITIAL_CAPITAL)}). ` +
          `Buy-and-hold vale ${usd(hold)}, así que la plataforma va ${eq >= hold ? 'por encima' : 'por debajo'} de la línea base por ${usd(Math.abs(eq - hold))}. ` +
          `Drawdown actual ${pct(dd)}, máximo ${pct(s.maxDrawdown)}. Breaker: ${s.breaker.status} (umbral ${pct(s.breaker.threshold)}). ` +
          `${s.orders.length} órdenes y ${s.decisions.length} decisiones registradas.`,
      }
    }
    case 'pausa': {
      const last = [...s.riskEvents].reverse().find((e) => e.type === 'circuit_breaker' || e.type === 'kill_switch')
      if (s.breaker.status === 'armado') {
        return { intent, text: `Ninguna pausa global activa: el breaker está armado y el drawdown es ${pct(dd)} contra un umbral de ${pct(s.breaker.threshold)}.` }
      }
      if (!last) return { intent, text: 'Las estrategias están pausadas, pero no encuentro el evento que lo causó.' }
      return {
        intent,
        text:
          last.type === 'kill_switch'
            ? `Se activó el kill switch en el tick ${last.tick} (RN-5). Todas las estrategias quedaron pausadas en ese mismo tick.`
            : `El circuit breaker se disparó en el tick ${last.tick}: el drawdown del portafolio agregado llegó a ${pct(last.value)}, sobre el umbral de ${pct(last.threshold)} (RN-3). ` +
              `Para reanudar se necesita un motivo escrito y que el drawdown baje del umbral (RN-4); hoy está en ${pct(dd)}.`,
      }
    }
    case 'estrategias': {
      const rows = s.strategies.map((st) => ({ st, ...strategyPnl(st, s.market.prices) }))
      rows.sort((a, b) => b.pnl - a.pnl)
      const lines = rows.map((r) => `${r.st.name}: ${r.pnl >= 0 ? '+' : ''}${usd(r.pnl)} (${pct(r.pnlPct)}), ${r.st.trades} operaciones, ${r.st.status}`)
      return { intent, text: `La que más aporta ahora es ${rows[0].st.name}. ${lines.join('. ')}.` }
    }
    case 'exposicion': {
      const ex = exposure(s)
      const parts = ASSETS.map((a) => `${a} ${pct(ex.byAsset[a].pct)}`)
      const top = ASSETS.reduce((m, a) => (ex.byAsset[a].pct > ex.byAsset[m].pct ? a : m), ASSETS[0])
      return {
        intent,
        text:
          `Exposición agregada: ${parts.join(', ')}; efectivo ${pct(1 - ex.investedPct)}. ` +
          `El activo más pesado es ${top}. El límite por activo es 60% (RN-6); las compras que lo rebasarían se rechazan. ` +
          'BTC, ETH y XRP se mueven juntos en esta simulación, así que la diversificación entre ellos es limitada.',
      }
    }
    case 'decisiones': {
      const since = s.market.tick - 24
      const recent = s.decisions.filter((d) => d.tick > since)
      const by = (r: string) => recent.filter((d) => d.result === r).length
      return {
        intent,
        text:
          `Últimas 24 horas simuladas: ${recent.length} decisiones — ${by('ejecutada')} ejecutadas, ${by('rechazada por límite')} rechazadas por límite, ` +
          `${by('reset del grid')} resets del grid y ${by('señal suprimida')} señales de Bollinger suprimidas por volatilidad alta. Detalle en la pantalla Decisiones.`,
      }
    }
    default:
      return { intent: 'ayuda', text: `Puedo explicar el estado del portafolio, no predecirlo. Prueba con: ${SUGGESTED_QUESTIONS.slice(0, 5).join(' · ')}.` }
  }
}
