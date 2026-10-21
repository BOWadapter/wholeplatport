// Capa 3 · Riesgo de portafolio. Circuit breaker global (RN-3), reanudación con aprobación
// humana (RN-4) y kill switch (RN-5). Funciones puras: el motor decide cuándo llamarlas.

export type BreakerStatus = 'armado' | 'disparado' | 'kill_switch'

export interface BreakerState {
  status: BreakerStatus
  /** Umbral de drawdown como fracción (0.10 = 10%). */
  threshold: number
}

export const THRESHOLD_MIN = 0.05
export const THRESHOLD_MAX = 0.25
export const RESUME_MIN_CHARS = 10

/** Drawdown desde el pico como fracción positiva (0.12 = −12%). */
export function drawdown(peak: number, equity: number): number {
  return peak > 0 ? Math.max(0, (peak - equity) / peak) : 0
}

/** RN-3: ¿se debe disparar el breaker en este tick? */
export function shouldTrip(b: BreakerState, dd: number): boolean {
  return b.status === 'armado' && dd >= b.threshold
}

export function clampThreshold(t: number): number {
  return Math.min(THRESHOLD_MAX, Math.max(THRESHOLD_MIN, t))
}

export type ResumeCheck = { ok: true; message: string } | { ok: false; message: string }

/** RN-4: reanudar exige motivo de ≥ 10 caracteres y drawdown actual bajo el umbral. */
export function canResume(b: BreakerState, dd: number, reason: string): ResumeCheck {
  if (b.status === 'armado') return { ok: false, message: 'El breaker no está disparado; no hay nada que reanudar.' }
  if (reason.trim().length < RESUME_MIN_CHARS) {
    return { ok: false, message: `Rechazado: el motivo debe tener al menos ${RESUME_MIN_CHARS} caracteres.` }
  }
  if (dd >= b.threshold) {
    return {
      ok: false,
      message: `Rechazado: el drawdown actual (${(dd * 100).toFixed(1)}%) sigue en o sobre el umbral (${(b.threshold * 100).toFixed(0)}%).`,
    }
  }
  return { ok: true, message: 'Reanudación aprobada: estrategias activas y breaker armado.' }
}
