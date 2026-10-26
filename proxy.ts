// Protección de rutas, RN-10 (en Next.js 16 "proxy" reemplaza a "middleware").
// Toda página requiere una sesión válida; sin ella se redirige a /login?next=<ruta>.

import { NextResponse, type NextRequest } from 'next/server'
import { readAuthConfig } from '@/lib/auth/config'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session'

const PUBLIC_PATHS = new Set(['/login', '/api/auth/login', '/api/auth/logout'])

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next()

  const auth = readAuthConfig()
  const token = request.cookies.get(SESSION_COOKIE)?.value
  const session = auth.ok ? await verifySessionToken(token, auth.config.secret) : null
  if (session) return NextResponse.next()

  // La API responde 401 en JSON; las páginas redirigen al formulario.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Sesión requerida.' }, { status: 401 })
  }

  const loginUrl = new URL('/login', request.url)
  if (pathname !== '/') loginUrl.searchParams.set('next', `${pathname}${search}`)
  const response = NextResponse.redirect(loginUrl)
  if (token) response.cookies.delete(SESSION_COOKIE) // cookie vencida o alterada
  return response
}

export const config = {
  // Todo excepto los archivos estáticos de Next y los íconos públicos.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png).*)'],
}
