// PA-09 (RN-10): solo usuarios autenticados acceden a la plataforma.
// Prueba las piezas puras del login: sesión firmada, credenciales, configuración, "next" y límite de intentos.
import { describe, expect, it } from 'vitest'
import { readAuthConfig } from '../lib/auth/config'
import { checkCredentials, LOCK_WINDOW_MS, LoginRateLimiter, MAX_FAILED_ATTEMPTS, safeNextPath } from '../lib/auth/credentials'
import { createSessionToken, SESSION_TTL_SECONDS, verifySessionToken } from '../lib/auth/session'

const SECRET = 'x'.repeat(40)
const CONFIG = { username: 'alumno', password: 'contrasena-larga', secret: SECRET }

describe('PA-09 · sesión firmada', () => {
  it('un token válido devuelve el usuario', async () => {
    const token = await createSessionToken('alumno', SECRET)
    expect((await verifySessionToken(token, SECRET))?.u).toBe('alumno')
  })

  it('sin token no hay sesión', async () => {
    expect(await verifySessionToken(undefined, SECRET)).toBeNull()
    expect(await verifySessionToken('', SECRET)).toBeNull()
  })

  it('un token alterado se rechaza', async () => {
    const token = await createSessionToken('alumno', SECRET)
    const [body, sig] = token.split('.')
    const forgedBody = Buffer.from(JSON.stringify({ u: 'admin', exp: Date.now() + 1e9 })).toString('base64url')
    expect(await verifySessionToken(`${forgedBody}.${sig}`, SECRET)).toBeNull()
    expect(await verifySessionToken(`${body}.${sig.slice(0, -2)}AA`, SECRET)).toBeNull()
    expect(await verifySessionToken('basura', SECRET)).toBeNull()
  })

  it('un token firmado con otro secreto se rechaza', async () => {
    const token = await createSessionToken('alumno', 'y'.repeat(40))
    expect(await verifySessionToken(token, SECRET)).toBeNull()
  })

  it('un token vencido se rechaza', async () => {
    const t0 = Date.now()
    const token = await createSessionToken('alumno', SECRET, t0)
    expect(await verifySessionToken(token, SECRET, t0 + SESSION_TTL_SECONDS * 1000 - 1)).not.toBeNull()
    expect(await verifySessionToken(token, SECRET, t0 + SESSION_TTL_SECONDS * 1000)).toBeNull()
  })
})

describe('PA-09 · credenciales', () => {
  it('acepta usuario y contraseña correctos', async () => {
    expect(await checkCredentials(CONFIG, 'alumno', 'contrasena-larga')).toBe(true)
    expect(await checkCredentials(CONFIG, '  alumno ', 'contrasena-larga')).toBe(true)
  })

  it('rechaza usuario o contraseña incorrectos', async () => {
    expect(await checkCredentials(CONFIG, 'alumno', 'otra')).toBe(false)
    expect(await checkCredentials(CONFIG, 'otro', 'contrasena-larga')).toBe(false)
    expect(await checkCredentials(CONFIG, '', '')).toBe(false)
  })
})

describe('PA-09 · configuración (falla cerrado)', () => {
  it('sin variables, el login queda deshabilitado', () => {
    expect(readAuthConfig({}).ok).toBe(false)
  })

  it('rechaza contraseña corta o secreto corto', () => {
    expect(readAuthConfig({ AUTH_USERNAME: 'a', AUTH_PASSWORD: 'corta', AUTH_SECRET: SECRET }).ok).toBe(false)
    expect(readAuthConfig({ AUTH_USERNAME: 'a', AUTH_PASSWORD: 'contrasena-larga', AUTH_SECRET: 'corto' }).ok).toBe(false)
  })

  it('acepta una configuración completa', () => {
    const r = readAuthConfig({ AUTH_USERNAME: 'alumno', AUTH_PASSWORD: 'contrasena-larga', AUTH_SECRET: SECRET })
    expect(r.ok && r.config.username).toBe('alumno')
  })
})

describe('PA-09 · redirección segura después del login', () => {
  it('solo permite rutas internas', () => {
    expect(safeNextPath('/riesgo')).toBe('/riesgo')
    expect(safeNextPath('/decisiones?x=1')).toBe('/decisiones?x=1')
    expect(safeNextPath('https://evil.com')).toBe('/')
    expect(safeNextPath('//evil.com')).toBe('/')
    expect(safeNextPath('/\\evil.com')).toBe('/')
    expect(safeNextPath('/login')).toBe('/')
    expect(safeNextPath(undefined)).toBe('/')
  })
})

describe('PA-09 · límite de intentos', () => {
  it(`bloquea tras ${MAX_FAILED_ATTEMPTS} fallos y se libera al pasar la ventana`, () => {
    const limiter = new LoginRateLimiter()
    const t0 = 1_000_000
    for (let i = 0; i < MAX_FAILED_ATTEMPTS - 1; i++) limiter.registerFailure('ip', t0)
    expect(limiter.isLocked('ip', t0)).toBe(false)
    limiter.registerFailure('ip', t0)
    expect(limiter.isLocked('ip', t0)).toBe(true)
    expect(limiter.isLocked('otra-ip', t0)).toBe(false)
    expect(limiter.isLocked('ip', t0 + LOCK_WINDOW_MS)).toBe(false)
  })

  it('un login correcto reinicia el contador', () => {
    const limiter = new LoginRateLimiter()
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) limiter.registerFailure('ip')
    limiter.reset('ip')
    expect(limiter.isLocked('ip')).toBe(false)
  })
})
