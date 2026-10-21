'use client'

// Pruebas de aceptación PA-01…PA-08. Corren sobre una simulación aislada (lib/acceptance.ts).

import { useState } from 'react'
import { Badge, Card, ScreenHeader } from '@/components/ui-bits'
import { ACCEPTANCE_TESTS, runAcceptance, type AcceptanceResult } from '@/lib/acceptance'

type TimedResult = AcceptanceResult & { durationMs: number }

function timed(id: string): TimedResult {
  const start = performance.now()
  const result = runAcceptance(id)
  return { ...result, durationMs: Math.round(performance.now() - start) }
}

export function TestsScreen() {
  const [results, setResults] = useState<Record<string, TimedResult>>({})
  const [running, setRunning] = useState(false)

  const runAll = () => {
    setRunning(true)
    // setTimeout deja que se pinte el estado "Ejecutando…" antes de bloquear el hilo.
    setTimeout(() => {
      const next: Record<string, TimedResult> = {}
      for (const test of ACCEPTANCE_TESTS) next[test.id] = timed(test.id)
      setResults(next)
      setRunning(false)
    }, 20)
  }

  const runOne = (id: string) => setResults((current) => ({ ...current, [id]: timed(id) }))

  const done = Object.values(results)
  const passed = done.filter((r) => r.passed).length
  const totalMs = done.reduce((sum, r) => sum + r.durationMs, 0)
  const allPassed = done.length === ACCEPTANCE_TESTS.length && passed === done.length

  return (
    <div className="screen">
      <ScreenHeader eyebrow="VERIFICACIÓN / PA-01—PA-08" title="Pruebas">
        <button className="primary" onClick={runAll} disabled={running}>
          {running ? 'Ejecutando…' : 'Ejecutar todas'}
        </button>
      </ScreenHeader>

      <Card>
        <p className="muted">Cada prueba corre sobre una simulación aislada y nueva; no toca tu estado.</p>
        {done.length > 0 && (
          <h2 className={allPassed ? 'positive' : 'negative'}>
            {passed}/{ACCEPTANCE_TESTS.length} aprobadas · {totalMs} ms
          </h2>
        )}

        {ACCEPTANCE_TESTS.map((test) => {
          const r = results[test.id]
          return (
            <div className="test-row" key={test.id}>
              <span className="test-id">
                {r ? (r.passed ? '✅' : '❌') : '○'} {test.id}
              </span>
              <Badge>{test.rule}</Badge>
              <span className="test-name">{test.name}</span>
              <button onClick={() => runOne(test.id)} disabled={running}>Ejecutar</button>
              {r && (
                <small className={r.passed ? 'muted' : 'negative'}>
                  {r.detail} · {r.durationMs} ms
                </small>
              )}
            </div>
          )
        })}
      </Card>
    </div>
  )
}
