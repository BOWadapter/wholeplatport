// Lectura de la sesión actual desde componentes de servidor (páginas).

import 'server-only'
import { cookies } from 'next/headers'
import { readAuthConfig } from './config'
import { SESSION_COOKIE, verifySessionToken } from './session'

/** Usuario de la sesión actual, o null. Para componentes de servidor. */
export async function getSessionUser(): Promise<string | null> {
  // Leer la cookie primero hace que la página se renderice por petición (no se prerenderiza en el build,
  // donde todavía no existen las variables AUTH_*).
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  const result = readAuthConfig()
  if (!result.ok) return null
  const session = await verifySessionToken(token, result.config.secret)
  return session?.u ?? null
}
