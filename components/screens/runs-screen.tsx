'use client'

// Corridas (RN-11): guarda la simulación actual en PostgreSQL y la restaura después, desde cualquier navegador.

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
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
import type { RunSummary } from '@/lib/db/snapshot'
import { fmt, pct } from '@/lib/format'
import { SCENARIOS } from '@/lib/sim/market'

type Status =
  | { kind: 'loading' }
  | { kind: 'ready'; runs: RunSummary[] }
  | { kind: 'unconfigured'; message: string }
  | { kind: 'error'; message: string }

type Notice = { ok: boolean; text: string } | null

async function readJson(res: Response) {
  try {
    return await res.json()
  } catch {
    return {}
  }
}

export function RunsScreen() {
  const { sim, loadSim } = usePlatport()
  const router = useRouter()
  const [status, setStatus] = useState<Status>({ kind: 'loading' })
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const [toDelete, setToDelete] = useState<RunSummary | null>(null)

  const refresh = useCallback(async () => {
    const res = await fetch('/api/runs', { cache: 'no-store' })
    const body = await readJson(res)
    if (res.ok) setStatus({ kind: 'ready', runs: body.runs })
    else if (res.status === 503) setStatus({ kind: 'unconfigured', message: body.error })
    else setStatus({ kind: 'error', message: body.error ?? `Error ${res.status}` })
  }, [])

  useEffect(() => {
    refresh().catch(() => setStatus({ kind: 'error', message: 'No se pudo contactar al servidor.' }))
  }, [refresh])

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setNotice(null)
    try {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, state: sim }),
      })
      const body = await readJson(res)
      if (!res.ok) {
        setNotice({ ok: false, text: body.error ?? `Error ${res.status}` })
        return
      }
      setNotice({ ok: true, text: `Guardada "${body.run.name}" en el tick ${body.run.tick}.` })
      setName('')
      await refresh()
    } catch {
      setNotice({ ok: false, text: 'No se pudo contactar al servidor.' })
    } finally {
      setBusy(false)
    }
  }

  const load = async (run: RunSummary) => {
    setBusy(true)
    setNotice(null)
    try {
      const res = await fetch(`/api/runs/${run.id}`, { cache: 'no-store' })
      const body = await readJson(res)
      if (!res.ok) {
        setNotice({ ok: false, text: body.error ?? `Error ${res.status}` })
        return
      }
      loadSim(body.state)
      router.push('/')
    } catch {
      setNotice({ ok: false, text: 'No se pudo contactar al servidor.' })
    } finally {
      setBusy(false)
    }
  }

  const remove = async (run: RunSummary) => {
    setToDelete(null)
    setBusy(true)
    try {
      const res = await fetch(`/api/runs/${run.id}`, { method: 'DELETE' })
      const body = await readJson(res)
      setNotice(res.ok ? { ok: true, text: `Eliminada "${run.name}".` } : { ok: false, text: body.error })
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const unavailable = status.kind === 'unconfigured' || status.kind === 'error'

  return (
    <div className="screen">
      <ScreenHeader eyebrow="DATOS / RN-11" title="Corridas" />

      <Card>
        <div className="card-title">Guardar la simulación actual</div>
        <p className="muted">
          Guarda el estado completo (tick {sim.market.tick}, {sim.orders.length} órdenes, {sim.decisions.length}{' '}
          decisiones) en PostgreSQL. Si ya existe una corrida con el mismo nombre, se reemplaza.
        </p>
        <form className="chat-form" onSubmit={save}>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Nombre de la corrida, p. ej. Caída 2022 · umbral 10%"
            maxLength={80}
            required
            disabled={unavailable}
            aria-label="Nombre de la corrida"
          />
          <button className="primary" type="submit" disabled={busy || unavailable || !name.trim()}>
            Guardar
          </button>
        </form>
        {notice && <p className={notice.ok ? 'positive' : 'amber-text'}>{notice.text}</p>}
      </Card>

      <Card>
        <div className="card-title">Corridas guardadas</div>
        {status.kind === 'loading' && <p className="muted">Cargando…</p>}
        {status.kind === 'unconfigured' && (
          <div className="alert amber">
            {status.message} La simulación sigue funcionando; solo no se puede guardar. Ver README → Base de datos.
          </div>
        )}
        {status.kind === 'error' && <div className="alert amber">{status.message}</div>}
        {status.kind === 'ready' && status.runs.length === 0 && (
          <p className="muted">Todavía no hay corridas guardadas.</p>
        )}
        {status.kind === 'ready' && status.runs.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Escenario</th>
                  <th>Tick</th>
                  <th>Valor</th>
                  <th>PnL</th>
                  <th>DD máx.</th>
                  <th>Breaker</th>
                  <th>Órdenes</th>
                  <th>Decisiones</th>
                  <th>Guardada</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {status.runs.map((run) => (
                  <tr key={run.id}>
                    <td className="truncate" title={run.name}>{run.name}</td>
                    <td>{SCENARIOS[run.scenario].label}</td>
                    <td>{run.tick}</td>
                    <td>{fmt(run.equity)}</td>
                    <td className={run.pnl >= 0 ? 'positive' : 'negative'}>{fmt(run.pnl)}</td>
                    <td>{pct(run.maxDrawdown)}</td>
                    <td>
                      <Badge tone={run.breakerStatus === 'armado' ? 'green-text' : 'amber-text'}>
                        {run.breakerStatus === 'kill_switch' ? 'kill switch' : run.breakerStatus}
                      </Badge>
                    </td>
                    <td>{run.orders}</td>
                    <td>{run.decisions}</td>
                    <td>{new Date(run.updatedAt).toLocaleString('es-MX')}</td>
                    <td className="row-actions">
                      <button onClick={() => load(run)} disabled={busy}>Cargar</button>
                      <button className="danger-btn" onClick={() => setToDelete(run)} disabled={busy}>
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <AlertDialog open={toDelete !== null} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar la corrida?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borrará "{toDelete?.name}" con sus órdenes, decisiones y eventos de riesgo. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setToDelete(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => toDelete && remove(toDelete)}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
