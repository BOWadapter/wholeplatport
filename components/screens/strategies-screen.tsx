'use client'

import { useEffect, useState } from 'react'
import { usePlatport } from '@/components/platport-context'
import { Card, ScreenHeader } from '@/components/ui-bits'
import { STRATEGIES, strategyPnl } from '@/lib/engine'
import type { StrategyState } from '@/lib/strategies/base'
import { ASSETS } from '@/lib/sim/market'
import { fmt, pct, price } from '@/lib/format'

export function StrategiesScreen() {
  const port = usePlatport()
  return (
    <div className="screen">
      <ScreenHeader eyebrow="CONTROL / EJECUCIÓN" title="Estrategias" />
      <div className="strategy-grid">
        {port.sim.strategies.map((strategy) => (
          <StrategyCard key={strategy.id} strategy={strategy} />
        ))}
      </div>
    </div>
  )
}

function StrategyCard({ strategy }: { strategy: StrategyState<any, any> }) {
  const port = usePlatport()
  const pnl = strategyPnl(strategy, port.sim.market.prices)
  type Field = { label: string; min: number; max: number; step: number }
  const spec = STRATEGIES[strategy.id].paramSpec as Record<string, Field>
  const [values, setValues] = useState<Record<string, number>>(strategy.params)
  const [error, setError] = useState('')

  useEffect(() => setValues(strategy.params), [strategy.params])

  const updateParam = (key: string, value: number) => {
    setValues((current) => ({ ...current, [key]: value }))
    setError(port.setStrategyParam(strategy.id, key, value) ?? '')
  }

  return (
    <Card>
      <div className="split">
        <div>
          <div className="eyebrow">{strategy.id}</div>
          <h2>{strategy.name}</h2>
        </div>
        <span className={`status ${strategy.status}`}>{strategy.status}</span>
      </div>
      <div className="kpi-row">
        <span>Capital inicial <b>{fmt(strategy.initialCapital)}</b></span>
        <span>Valor <b>{fmt(pnl.equity)}</b></span>
        <span>PnL <b className={pnl.pnl >= 0 ? 'positive' : 'negative'}>{fmt(pnl.pnl)} ({pct(pnl.pnlPct)})</b></span>
        <span>Realizado <b>{fmt(strategy.realizedPnl)}</b></span>
        <span>Operaciones <b>{strategy.trades}</b></span>
        <span>Efectivo <b>{fmt(strategy.cash)}</b></span>
      </div>
      <div className="positions">
        {ASSETS.map((asset) => (
          <span key={asset}>
            {asset} {strategy.positions[asset].toFixed(asset === 'XRP' ? 2 : 6)}
          </span>
        ))}
      </div>
      <div className="param-form">
        {Object.entries(spec).map(([key, field]) => (
          <label key={key}>
            {field.label}
            <input
              type="number"
              min={field.min}
              max={field.max}
              step={field.step}
              value={values[key] ?? ''}
              onChange={(event) => updateParam(key, Number(event.target.value))}
            />
          </label>
        ))}
      </div>
      {error && <div className="inline-error">{error}</div>}
      <button
        onClick={() => {
          const next = strategy.status === 'activa' ? 'pausada' : 'activa'
          setError(port.setStrategyStatus(strategy.id, next) ?? '')
        }}
      >
        {strategy.status === 'activa' ? 'Pausar' : 'Reanudar'}
      </button>
      {strategy.id === 'dynamic_grid' && (
        <div className="mini-list">
          {ASSETS.map((asset) => {
            const grid = strategy.internal.grids[asset]
            return (
              <span key={asset}>
                {asset}: centro {price(grid.center, asset)} · nivel {grid.level} · resets {grid.resets}
              </span>
            )
          })}
        </div>
      )}
    </Card>
  )
}
