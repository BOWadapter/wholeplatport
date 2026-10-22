// Utilidades HTTP para los route handlers de /api/auth.

import { NextResponse, type NextRequest } from 'next/server'

interface CookieOptions {
  name: string
  value: string
  httpOnly?: boolean
  sameSite?: 'lax' | 'strict' | 'none'
  secure?: boolean
  path?: string
  maxAge?: number
}

/** Host que usó el navegador (respeta proxies inversos). */
function requestHost(request: NextRequest): string {
  return request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? request.nextUrl.host
}

/** Rechaza formularios enviados desde otro origen (protección CSRF básica). */
export function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return true // sin cabecera Origin (p. ej. curl); la cookie además es SameSite=Lax
  try {
    return new URL(origin).host === requestHost(request)
  } catch {
    return false
  }
}

/** La cookie solo lleva "Secure" cuando la petición llegó por HTTPS (así funciona en http://localhost). */
export function isHttps(request: NextRequest): boolean {
  const proto = request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol.replace(':', '')
  return proto.split(',')[0].trim() === 'https'
}

/** Clave para el límite de intentos: la IP del cliente. */
export function clientKey(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0].trim() || request.headers.get('x-real-ip') || 'local'
}

function absolute(request: NextRequest, path: string): URL {
  return new URL(path, `${isHttps(request) ? 'https' : 'http'}://${requestHost(request)}`)
}

/** Redirección 303 (después de un POST, el navegador hace GET a la nueva ruta). */
export function seeOther(request: NextRequest, path: string): NextResponse {
  return NextResponse.redirect(absolute(request, path), 303)
}

export function redirectWithCookie(request: NextRequest, path: string, cookie: CookieOptions): NextResponse {
  const response = seeOther(request, path)
  response.cookies.set(cookie)
  return response
}
