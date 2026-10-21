'use client'

// Registro de decisiones (RN-2): cada orden, rechazo, reset del grid y señal suprimida.

import { useMemo, useState } from 'react'
import { usePlatport } from '@/components/platport-context'
import { Badge, Card, ScreenHeader } from '@/components/ui-bits'
import type { DecisionResult } from '@/lib/engine'
import { price } from '@/lib/format'
import { ASSETS } from '@/lib/sim/market'

const PAGE_SIZE = 50

const RESULTS: DecisionResult[] = [
  'ejecutada',
  'rechazada por límite',
  'rechazada sin saldo',
  'rechazada sin posición',
  'reset del grid',
  'señal suprimida',
]

const RESULT_TONE: Record<DecisionResult, string> = {
  ejecutada: 'green-text',
  'rechazada por límite': 'amber-text',
  'rechazada sin saldo': 'muted-text',
  'rechazada sin posición': 'muted-text',
  'reset del grid': 'blue-text',
  'señal suprimida': 'violet-text',
}

const STRATEGY_LABEL: Record<string, string> = {
  smart_dca: 'Smart DCA',
  dynamic_grid: 'Grid dinámico',
}

export function DecisionsScreen() {
  const { sim } = usePlatport()
  const [strategy, setStrategy] = useState('todas')
  const [asset, setAsset] = useState('todos')
  const [result, setResult] = useState('todos')
  const [page, setPage] = useState(1)

  const filtered = useMemo(
    () =>
      [...sim.decisions]
        .reverse()
        .filter(
          (d) =>
            (strategy === 'todas' || d.strategyId === strategy) &&
            (asset === 'todos' || d.asset === asset) &&
            (result === 'todos' || d.result === result),
        ),
    [sim.decisions, strategy, asset, result],
  )

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pages)
  const rows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const count = (value: DecisionResult) => sim.decisions.filter((d) => d.result === value).length

  const onFilter = (setter: (v: string) => void) => (event: React.ChangeEvent<HTMLSelectElement>) => {
    setter(event.target.value)
    setPage(1)
  }

  return (
    <div className="screen">
      <ScreenHeader eyebrow="AUDITORÍA / RN-2" title="Decisiones" />
      <Card>
        <div className="counters">
          <span>Total <b>{sim.decisions.length}</b></span>
          <span>Ejecutadas <b>{count('ejecutada')}</b></span>
          <span className="amber-text">Rechazadas por límite <b>{count('rechazada por límite')}</b></span>
          <span className="blue-text">Resets del grid <b>{count('reset del grid')}</b></span>
          <span className="violet-text">Señales suprimidas <b>{count('señal suprimida')}</b></span>
        </div>

        <div className="filters">
          <select value={strategy} onChange={onFilter(setStrategy)} aria-label="Estrategia">
            <option value="todas">Todas las estrategias</option>
            <option value="smart_dca">Smart DCA</option>
            <option value="dynamic_grid">Grid dinámico</option>
          </select>
          <select value={asset} onChange={onFilter(setAsset)} aria-label="Activo">
            <option value="todos">Todos los activos</option>
            {ASSETS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <select value={result} onChange={onFilter(setResult)} aria-label="Resultado">
            <option value="todos">Todos los resultados</option>
            {RESULTS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tick</th>
                <th>Estrategia</th>
                <th>Activo</th>
                <th>Lado</th>
                <th>Precio</th>
                <th>Cantidad</th>
                <th>RSI</th>
                <th>Régimen</th>
                <th>Regla</th>
                <th>Resultado</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={11} className="muted">Sin decisiones todavía. Avanza la simulación.</td>
                </tr>
              )}
              {rows.map((d) => (
                <tr key={d.id}>
                  <td>{d.tick}</td>
                  <td>{STRATEGY_LABEL[d.strategyId]}</td>
                  <td>{d.asset}</td>
                  <td>{d.side ?? '—'}</td>
                  <td>{price(d.price, d.asset)}</td>
                  <td>{d.qty ? d.qty.toFixed(6) : '—'}</td>
                  <td>{d.rsi.toFixed(1)}</td>
                  <td>{d.regime === 'alta' ? <Badge tone="amber-text">alta</Badge> : 'normal'}</td>
                  <td>{d.rule}</td>
                  <td>
                    <Badge tone={RESULT_TONE[d.result]}>{d.result}</Badge>
                  </td>
                  <td className="truncate" title={d.detail}>{d.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="pagination">
          <button disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Anterior</button>
          <span>Página {currentPage} de {pages} · {filtered.length} registros</span>
          <button disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>Siguiente</button>
        </div>
      </Card>
    </div>
  )
}
