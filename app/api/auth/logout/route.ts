// POST /api/auth/logout · borra la cookie de sesión y vuelve a /login.

import type { NextRequest } from 'next/server'
import { isSameOrigin, redirectWithCookie } from '@/lib/auth/http'
import { SESSION_COOKIE } from '@/lib/auth/session'

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return new Response('Origen no permitido', { status: 403 })
  return redirectWithCookie(request, '/login?salida=1', { name: SESSION_COOKIE, value: '', path: '/', maxAge: 0 })
}
