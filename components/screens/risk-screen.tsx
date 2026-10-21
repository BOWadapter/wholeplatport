'use client'

// Riesgo (capa 3): umbral del breaker (RN-3), reanudación con motivo (RN-4), kill switch (RN-5)
// y exposición agregada por activo (RN-6).

import { useState } from 'react'
import { usePlatport } from '@/components/platport-context'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge, Card, ScreenHeader } from '@/components/ui-bits'
import { currentDrawdown, exposure, type RiskEventType } from '@/lib/engine'
import { fmt, pct } from '@/lib/format'
import { MAX_EXPOSURE } from '@/lib/risk/exposure'
import { RESUME_MIN_CHARS, THRESHOLD_MAX, THRESHOLD_MIN } from '@/lib/risk/circuit-breaker'
import { ASSETS } from '@/lib/sim/market'

const EVENT_META: Record<RiskEventType, { icon: string; label: string; rule: string; tone: string }> = {
  circuit_breaker: { icon: '⛔', label: 'Circuit breaker', rule: 'RN-3', tone: 'negative' },
  kill_switch: { icon: '⏻', label: 'Kill switch', rule: 'RN-5', tone: 'negative' },
  reanudacion: { icon: '▶', label: 'Reanudación', rule: 'RN-4', tone: 'positive' },
  reanudacion_rechazada: { icon: '✋', label: 'Reanudación rechazada', rule: 'RN-4', tone: 'amber-text' },
  cambio_umbral: { icon: '⚙', label: 'Cambio de umbral', rule: 'RN-3', tone: 'muted' },
}

export function RiskScreen() {
  const port = usePlatport()
  const { sim } = port
  const [reason, setReason] = useState('')
  const [resumeMessage, setResumeMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [killDialogOpen, setKillDialogOpen] = useState(false)

  const drawdown = currentDrawdown(sim)
  const assetExposure = exposure(sim)
  const armed = sim.breaker.status === 'armado'

  const resume = () => {
    const result = port.requestResume(reason)
    setResumeMessage({ ok: result.ok, text: result.message })
    if (result.ok) setReason('')
  }

  return (
    <div className="screen">
      <ScreenHeader eyebrow="CONTROL / RIESGO" title="Riesgo" />

      <div className="grid-2">
        <Card>
          <div className="card-title">Circuit breaker global · RN-3</div>
          <label className="field">
            Umbral de drawdown: <b>{pct(sim.breaker.threshold, 0)}</b>
            <input
              className="wide"
              type="range"
              min={THRESHOLD_MIN}
              max={THRESHOLD_MAX}
              step={0.01}
              value={sim.breaker.threshold}
              onChange={(event) => port.setThreshold(Number(event.target.value))}
            />
          </label>
          <div className="gauge">
            <div
              className={!armed ? 'over' : drawdown / sim.breaker.threshold > 0.7 ? 'warn' : ''}
              style={{ width: `${Math.min((drawdown / sim.breaker.threshold) * 100, 100)}%` }}
            />
          </div>
          <p className="muted">
            Drawdown actual {pct(drawdown)} · máximo {pct(sim.maxDrawdown)} · estado <b>{sim.breaker.status}</b>
          </p>
          <button className="danger-btn" onClick={() => setKillDialogOpen(true)} disabled={!armed}>
            Kill switch
          </button>
        </Card>

        <Card>
          <div className="card-title">Reanudación con aprobación humana · RN-4</div>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={`Motivo de al menos ${RESUME_MIN_CHARS} caracteres`}
            disabled={armed}
            rows={3}
          />
          <button onClick={resume} disabled={armed}>Solicitar reanudación</button>
          {armed && <p className="muted">El breaker está armado; no hay nada que reanudar.</p>}
          {resumeMessage && (
            <p className={resumeMessage.ok ? 'positive' : 'amber-text'}>{resumeMessage.text}</p>
          )}
        </Card>
      </div>

      <Card>
        <div className="card-title">Exposición agregada · RN-6</div>
        {ASSETS.map((asset) => {
          const value = assetExposure.byAsset[asset]
          return (
            <div className="exposure" key={asset}>
              <span>{asset}</span>
              <div>
                <i style={{ width: `${Math.min(value.pct * 100, 100)}%` }} />
                <em style={{ left: `${MAX_EXPOSURE * 100}%` }} title="Límite 60%" />
              </div>
              <b>{pct(value.pct)}</b>
              <small className="muted">{fmt(value.value)}</small>
            </div>
          )
        })}
        <div className="muted">La marca vertical es el límite de {pct(MAX_EXPOSURE, 0)} por activo.</div>
      </Card>

      <Card>
        <div className="card-title">Historial de eventos de riesgo</div>
        {sim.riskEvents.length === 0 && <p className="muted">Sin eventos todavía.</p>}
        {[...sim.riskEvents].reverse().map((event) => {
          const meta = EVENT_META[event.type]
          return (
            <div className="event" key={event.id}>
              <span className={meta.tone}>{meta.icon}</span>
              <span className="tick">T+{event.tick}</span>
              <b>{meta.label}</b>
              <Badge>{meta.rule}</Badge>
              <span className="muted">drawdown {pct(event.value)} · umbral {pct(event.threshold, 0)}</span>
              <span>{event.action}</span>
            </div>
          )
        })}
      </Card>

      <AlertDialog open={killDialogOpen} onOpenChange={setKillDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Activar kill switch?</AlertDialogTitle>
            <AlertDialogDescription>
              Pausará ambas estrategias en este mismo tick y registrará un evento RN-5. Para volver a operar
              tendrás que solicitar la reanudación con un motivo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setKillDialogOpen(false)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                port.killSwitch()
                setKillDialogOpen(false)
              }}
            >
              Confirmar kill switch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
