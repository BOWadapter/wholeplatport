// Verificación de usuario y contraseña, límite de intentos y saneo del parámetro "next".

import type { AuthConfig } from './config'
import { hmac, timingSafeEqual } from './session'

/**
 * Compara usuario y contraseña en tiempo constante: se comparan los HMAC (mismo largo siempre),
 * no los textos, para no revelar por tiempos qué parte coincide.
 */
export async function checkCredentials(config: AuthConfig, username: string, password: string): Promise<boolean> {
  const [u1, u2, p1, p2] = await Promise.all([
    hmac(config.secret, `u:${username.trim()}`),
    hmac(config.secret, `u:${config.username}`),
    hmac(config.secret, `p:${password}`),
    hmac(config.secret, `p:${config.password}`),
  ])
  const userOk = timingSafeEqual(u1, u2)
  const passOk = timingSafeEqual(p1, p2)
  return userOk && passOk
}

/** Solo permite volver a rutas internas ("/riesgo"), nunca a otro sitio ("//evil.com", "https://..."). */
export function safeNextPath(value: unknown): string {
  if (typeof value !== 'string') return '/'
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/'
  if (value.startsWith('/login') || value.startsWith('/api/')) return '/'
  return value
}

// ---------- Límite de intentos fallidos por IP (en memoria) ----------

export const MAX_FAILED_ATTEMPTS = 5
export const LOCK_WINDOW_MS = 15 * 60 * 1000

interface Attempts {
  count: number
  resetAt: number
}

export class LoginRateLimiter {
  private store = new Map<string, Attempts>()

  isLocked(key: string, now = Date.now()): boolean {
    const entry = this.store.get(key)
    if (!entry) return false
    if (entry.resetAt <= now) {
      this.store.delete(key)
      return false
    }
    return entry.count >= MAX_FAILED_ATTEMPTS
  }

  registerFailure(key: string, now = Date.now()): void {
    const entry = this.store.get(key)
    if (!entry || entry.resetAt <= now) {
      this.store.set(key, { count: 1, resetAt: now + LOCK_WINDOW_MS })
    } else {
      entry.count += 1
    }
  }

  reset(key: string): void {
    this.store.delete(key)
  }
}
