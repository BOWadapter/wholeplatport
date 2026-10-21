'use client'

// Portafolio: vista agregada (capas 3 y 6). Valor, drawdown, exposición y gate de la demo.

import { CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { usePlatport } from '@/components/platport-context'
import { Card, KPI, ScreenHeader } from '@/components/ui-bits'
import { currentDrawdown, exposure, holdValue, INITIAL_CAPITAL, totalEquity } from '@/lib/engine'
import { fmt, pct } from '@/lib/format'
import { MAX_EXPOSURE } from '@/lib/risk/exposure'
import { ASSETS } from '@/lib/sim/market'

const SLICE_COLORS: Record<string, string> = {
  BTC: 'var(--c-btc)',
  ETH: 'var(--c-eth)',
  XRP: 'var(--c-xrp)',
  Efectivo: 'var(--c-cash)',
}

export function PortfolioScreen() {
  const { sim, gateRunning, runGateDemo } = usePlatport()
  const equity = totalEquity(sim)
  const pnl = equity - INITIAL_CAPITAL
  const drawdown = currentDrawdown(sim)
  const assetExposure = exposure(sim)
  const triggerLevel = sim.peak * (1 - sim.breaker.threshold)

  const lastStop = [...sim.riskEvents].reverse().find((e) => e.type === 'circuit_breaker' || e.type === 'kill_switch')
  const stopped = sim.breaker.status !== 'armado'
  const stopMessage =
    stopped && lastStop?.type === 'circuit_breaker'
      ? `Gate cumplido: el drawdown (${pct(lastStop.value)}) detuvo ambos bots en el tick ${lastStop.tick}.`
      : stopped && lastStop?.type === 'kill_switch'
        ? `Pausado por kill switch en el tick ${lastStop.tick}.`
        : ''

  const slices = [
    ...ASSETS.map((a) => ({ name: a, value: assetExposure.byAsset[a].pct })),
    { name: 'Efectivo', value: Math.max(0, 1 - assetExposure.investedPct) },
  ]

  return (
    <div className="screen">
      <ScreenHeader eyebrow="OVERVIEW / SIMULACIÓN" title="Portafolio">
        <button className="primary" onClick={runGateDemo} disabled={gateRunning}>
          {gateRunning ? 'Caída en curso…' : 'Demo del gate'}
        </button>
      </ScreenHeader>

      {gateRunning && (
        <div className="alert amber">
          Caída tipo 2022 en curso · drawdown {pct(drawdown)} / umbral {pct(sim.breaker.threshold)}
        </div>
      )}
      {!gateRunning && stopMessage && <div className="alert danger">{stopMessage}</div>}

      <div className="kpis">
        <KPI label="VALOR TOTAL" value={fmt(equity)} />
        <KPI
          label="PNL VS 10,000"
          value={`${pnl >= 0 ? '+' : ''}${fmt(pnl)}`}
          tone={pnl >= 0 ? 'positive' : 'negative'}
        />
        <KPI label="DRAWDOWN ACTUAL" value={pct(drawdown)} tone={drawdown > 0 ? 'negative' : ''} />
        <KPI label="DRAWDOWN MÁXIMO" value={pct(sim.maxDrawdown)} />
        <KPI label="% INVERTIDO" value={pct(assetExposure.investedPct)} />
      </div>

      <div className="grid-2">
        <Card>
          <div className="card-title">Valor vs. buy-and-hold</div>
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sim.equity} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--line)" strokeDasharray="2 4" />
                <XAxis dataKey="tick" stroke="var(--muted)" fontSize={11} />
                <YAxis
                  stroke="var(--muted)"
                  fontSize={11}
                  width={56}
                  domain={['auto', 'auto']}
                  tickFormatter={(v: number) => `${(v / 1000).toFixed(1)}k`}
                />
                <Tooltip
                  contentStyle={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
                  labelFormatter={(t) => `Tick ${t}`}
                  formatter={(value) => fmt(Number(value ?? 0))}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <ReferenceLine
                  y={triggerLevel}
                  stroke="var(--amber)"
                  strokeDasharray="5 5"
                  label={{ value: 'Nivel de disparo', fill: 'var(--amber)', fontSize: 11, position: 'insideBottomRight' }}
                />
                <Line dataKey="equity" name="Plataforma" stroke="var(--green)" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line dataKey="hold" name="Buy-and-hold" stroke="var(--muted)" dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <div className="card-title">Exposición por activo</div>
          <div className="chart donut">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={slices} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" isAnimationActive={false}>
                  {slices.map((s) => (
                    <Cell key={s.name} fill={SLICE_COLORS[s.name]} stroke="var(--panel)" />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
                  formatter={(value) => pct(Number(value ?? 0))}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="legend">
            {slices.map((s) => (
              <span key={s.name}>
                <i style={{ background: SLICE_COLORS[s.name] }} />
                {s.name} {pct(s.value)}
              </span>
            ))}
          </div>
          <div className="muted">Límite {pct(MAX_EXPOSURE, 0)} por activo (RN-6).</div>
        </Card>
      </div>

      <Card>
        <div className="split">
          <div>
            <div className="eyebrow">CONTROL GLOBAL · RN-3</div>
            <h2>Circuit breaker</h2>
          </div>
          <span className={`status ${sim.breaker.status}`}>
            {sim.breaker.status === 'kill_switch' ? 'kill switch' : sim.breaker.status}
          </span>
        </div>
        <div className="gauge">
          <div
            className={stopped ? 'over' : drawdown / sim.breaker.threshold > 0.7 ? 'warn' : ''}
            style={{ width: `${Math.min((drawdown / sim.breaker.threshold) * 100, 100)}%` }}
          />
        </div>
        <p className="muted">
          Drawdown {pct(drawdown)} de un umbral de {pct(sim.breaker.threshold)} · Buy-and-hold vale {fmt(holdValue(sim))}
        </p>
      </Card>
    </div>
  )
}
