// Usuario de la sesión a partir de la cookie de una petición (para route handlers de la API).

import type { NextRequest } from 'next/server'
import { readAuthConfig } from './config'
import { SESSION_COOKIE, verifySessionToken } from './session'

export async function sessionUserFromRequest(request: NextRequest): Promise<string | null> {
  const auth = readAuthConfig()
  if (!auth.ok) return null
  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value, auth.config.secret)
  return session?.u ?? null
}
