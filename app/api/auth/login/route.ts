// POST /api/auth/login · recibe el formulario de /login, valida y crea la cookie de sesión (RN-10).

import type { NextRequest } from 'next/server'
import { readAuthConfig } from '@/lib/auth/config'
import { checkCredentials, LoginRateLimiter, safeNextPath } from '@/lib/auth/credentials'
import { clientKey, isHttps, isSameOrigin, redirectWithCookie, seeOther } from '@/lib/auth/http'
import { createSessionToken, SESSION_COOKIE, SESSION_TTL_SECONDS } from '@/lib/auth/session'

// Un limitador por proceso: suficiente para una sola instancia (contenedor del taller).
const limiter = new LoginRateLimiter()

function backToLogin(request: NextRequest, error: string, next: string) {
  const params = new URLSearchParams({ error })
  if (next !== '/') params.set('next', next)
  return seeOther(request, `/login?${params}`)
}

export async function POST(request: NextRequest) {
  const form = await request.formData()
  const username = String(form.get('username') ?? '')
  const password = String(form.get('password') ?? '')
  const next = safeNextPath(form.get('next'))

  if (!isSameOrigin(request)) return backToLogin(request, 'origen', next)

  const auth = readAuthConfig()
  if (!auth.ok) return backToLogin(request, 'config', next)

  const key = clientKey(request)
  if (limiter.isLocked(key)) return backToLogin(request, 'bloqueado', next)

  if (!(await checkCredentials(auth.config, username, password))) {
    limiter.registerFailure(key)
    return backToLogin(request, 'credenciales', next)
  }

  limiter.reset(key)
  const token = await createSessionToken(auth.config.username, auth.config.secret)
  return redirectWithCookie(request, next, {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttps(request),
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  })
}
