'use client'

// Estado global de la UI. Toda la lógica vive en lib/engine.ts (funciones puras); este archivo solo
// guarda el SimState, expone acciones y persiste en localStorage (opcional, envuelto en try/catch).

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  createSim,
  DEFAULT_SEED,
  killSwitch as engineKill,
  requestResume as engineResume,
  setScenario as engineScenario,
  setStrategyParam as engineParam,
  setStrategyStatus as engineStatus,
  setThreshold as engineThreshold,
  step,
  stepN,
  type SimState,
} from '@/lib/engine'
import type { Scenario } from '@/lib/sim/market'
import type { StrategyId } from '@/lib/strategies/base'
import type { ResumeCheck } from '@/lib/risk/circuit-breaker'

const STORAGE_KEY = 'whole-platport-lite:v1'
const MAX_PERSIST_BYTES = 2_000_000
const AUTO_INTERVAL_MS = 1000
const GATE_WARMUP_TICKS = 72
const GATE_INTERVAL_MS = 180
const GATE_MAX_TICKS = 200

export interface PlatportContextValue {
  sim: SimState
  auto: boolean
  gateRunning: boolean
  advance: (n?: number) => void
  setAuto: (on: boolean) => void
  setScenario: (s: Scenario) => void
  reset: () => void
  killSwitch: () => void
  requestResume: (reason: string) => ResumeCheck
  setThreshold: (t: number) => void
  setStrategyStatus: (id: StrategyId, status: 'activa' | 'pausada') => string | undefined
  setStrategyParam: (id: StrategyId, key: string, value: number) => string | undefined
  /** Gate de la demo: reinicia, calienta 72 ticks en mercado normal, cambia a "Caída tipo 2022" y avanza tick a tick hasta el disparo. */
  runGateDemo: () => void
  /** Reemplaza la simulación por una corrida restaurada desde la base de datos (RN-11). */
  loadSim: (state: SimState) => void
}

const Ctx = createContext<PlatportContextValue | null>(null)

function load(): SimState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SimState
    return parsed?.version === 1 && parsed.mode === 'dry-run' ? parsed : null
  } catch {
    return null
  }
}

function save(sim: SimState) {
  try {
    const raw = JSON.stringify(sim)
    if (raw.length < MAX_PERSIST_BYTES) window.localStorage.setItem(STORAGE_KEY, raw)
  } catch {
    /* sin almacenamiento: la app sigue funcionando en memoria */
  }
}

export function PlatportProvider({ children }: { children: ReactNode }) {
  const [sim, setSimState] = useState<SimState>(() => createSim(DEFAULT_SEED))
  const [auto, setAutoState] = useState(false)
  const [gateRunning, setGateRunning] = useState(false)
  const simRef = useRef(sim)
  const hydrated = useRef(false)

  const setSim = useCallback((next: SimState) => {
    simRef.current = next
    setSimState(next)
  }, [])

  // Hidratar desde localStorage después del primer render (evita desajustes SSR).
  useEffect(() => {
    const stored = load()
    if (stored) setSim(stored)
    hydrated.current = true
  }, [setSim])

  useEffect(() => {
    if (hydrated.current) save(sim)
  }, [sim])

  // Auto: 1 tick por segundo; se detiene solo si el breaker o el kill switch pausan todo.
  useEffect(() => {
    if (!auto) return
    const id = window.setInterval(() => setSim(step(simRef.current)), AUTO_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [auto, setSim])

  useEffect(() => {
    if (auto && sim.breaker.status !== 'armado') setAutoState(false)
  }, [auto, sim.breaker.status])

  // Demo del gate: animación tick por tick.
  useEffect(() => {
    if (!gateRunning) return
    let ticks = 0
    const id = window.setInterval(() => {
      const next = step(simRef.current)
      setSim(next)
      ticks += 1
      if (next.breaker.status !== 'armado' || ticks >= GATE_MAX_TICKS) setGateRunning(false)
    }, GATE_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [gateRunning, setSim])

  const value = useMemo<PlatportContextValue>(
    () => ({
      sim,
      auto,
      gateRunning,
      advance: (n = 1) => setSim(stepN(simRef.current, n)),
      setAuto: (on) => setAutoState(on && simRef.current.breaker.status === 'armado'),
      setScenario: (s) => setSim(engineScenario(simRef.current, s)),
      reset: () => {
        setAutoState(false)
        setGateRunning(false)
        setSim(createSim(DEFAULT_SEED))
      },
      killSwitch: () => {
        setAutoState(false)
        setGateRunning(false)
        setSim(engineKill(simRef.current))
      },
      requestResume: (reason) => {
        const { state, result } = engineResume(simRef.current, reason)
        setSim(state)
        return result
      },
      setThreshold: (t) => setSim(engineThreshold(simRef.current, t)),
      setStrategyStatus: (id, status) => {
        const { state, error } = engineStatus(simRef.current, id, status)
        setSim(state)
        return error
      },
      setStrategyParam: (id, key, v) => {
        const { state, error } = engineParam(simRef.current, id, key, v)
        setSim(state)
        return error
      },
      runGateDemo: () => {
        setAutoState(false)
        setSim(engineScenario(stepN(createSim(DEFAULT_SEED), GATE_WARMUP_TICKS), 'crash'))
        setGateRunning(true)
      },
      loadSim: (state) => {
        setAutoState(false)
        setGateRunning(false)
        setSim(state)
      },
    }),
    [sim, auto, gateRunning, setSim],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function usePlatport(): PlatportContextValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('usePlatport debe usarse dentro de <PlatportProvider>')
  return v
}
