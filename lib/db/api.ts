// Piezas comunes de los endpoints /api/runs: sesión, base configurada y errores en JSON.

import type { NextRequest } from 'next/server'
import { sessionUserFromRequest } from '../auth/request'
import { isSameOrigin } from '../auth/http'
import { isDbConfigured } from './client'

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

/** Valida sesión, origen (en escrituras) y base de datos. Devuelve el usuario o una respuesta de error. */
export async function guard(request: NextRequest, write = false): Promise<{ user: string } | { error: Response }> {
  const user = await sessionUserFromRequest(request)
  if (!user) return { error: json({ error: 'Sesión requerida.' }, 401) }
  if (write && !isSameOrigin(request)) return { error: json({ error: 'Origen no permitido.' }, 403) }
  if (!isDbConfigured()) {
    return { error: json({ error: 'La base de datos no está configurada (DATABASE_URL).', configured: false }, 503) }
  }
  return { user }
}

export function dbFailure(error: unknown): Response {
  console.error('[db]', error)
  return json({ error: 'No se pudo completar la operación en la base de datos.' }, 500)
}
