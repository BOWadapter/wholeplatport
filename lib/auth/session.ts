// Sesión sin base de datos: un token firmado con HMAC-SHA256 dentro de una cookie httpOnly.
//   token = base64url(JSON {u, exp}) + "." + base64url(HMAC(body))
// Usa Web Crypto, así que funciona igual en proxy.ts, en route handlers y en las pruebas.

export const SESSION_COOKIE = 'wpl_session'
export const SESSION_TTL_SECONDS = 8 * 60 * 60 // 8 horas

export interface SessionPayload {
  /** usuario */
  u: string
  /** expiración en milisegundos Unix */
  exp: number
}

const encoder = new TextEncoder()

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4)
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

/** HMAC-SHA256 de un texto con el secreto dado. */
export async function hmac(secret: string, text: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ])
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(text)))
}

/** Compara dos arreglos de bytes sin salir antes al primer byte distinto. */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

export async function createSessionToken(username: string, secret: string, now = Date.now()): Promise<string> {
  const payload: SessionPayload = { u: username, exp: now + SESSION_TTL_SECONDS * 1000 }
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)))
  return `${body}.${toBase64Url(await hmac(secret, body))}`
}

/** Devuelve el payload si la firma es válida y no ha vencido; si no, null. */
export async function verifySessionToken(
  token: string | undefined,
  secret: string,
  now = Date.now(),
): Promise<SessionPayload | null> {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null
  const [body, signature] = parts
  try {
    if (!timingSafeEqual(fromBase64Url(signature), await hmac(secret, body))) return null
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as SessionPayload
    if (typeof payload.u !== 'string' || typeof payload.exp !== 'number') return null
    if (payload.exp <= now) return null
    return payload
  } catch {
    return null
  }
}
