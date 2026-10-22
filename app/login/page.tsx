// Pantalla de inicio de sesión. Es un formulario HTML que envía a /api/auth/login.

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { readAuthConfig } from '@/lib/auth/config'
import { safeNextPath } from '@/lib/auth/credentials'
import { getSessionUser } from '@/lib/auth/server'

export const metadata: Metadata = { title: 'Iniciar sesión · Whole Platport Lite' }

const ERRORS: Record<string, string> = {
  credenciales: 'Usuario o contraseña incorrectos.',
  bloqueado: 'Demasiados intentos fallidos. Espera 15 minutos e intenta de nuevo.',
  origen: 'La solicitud no vino de este sitio. Recarga la página e intenta de nuevo.',
  config: 'El inicio de sesión no está configurado en el servidor.',
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const next = safeNextPath(typeof params.next === 'string' ? params.next : '/')
  if (await getSessionUser()) redirect(next)

  const config = readAuthConfig()
  const errorKey = typeof params.error === 'string' ? params.error : ''
  const error = ERRORS[errorKey]
  const loggedOut = params.salida === '1'

  return (
    <div className="login-page">
      <div className="academic-banner">Simulación académica · dry-run · sin dinero real</div>
      <main className="login-main">
        <form className="login-card" method="post" action="/api/auth/login">
          <div className="brand">
            <span className="brand-mark">WP</span>
            WHOLE PLATPORT <b>/ LITE</b>
          </div>
          <h1>Iniciar sesión</h1>

          {!config.ok && (
            <div className="alert amber" role="alert">
              Inicio de sesión deshabilitado: {config.problem} Configúralas en el archivo <code>.env</code> (ver
              README).
            </div>
          )}
          {error && config.ok && (
            <div className="alert danger" role="alert">
              {error}
            </div>
          )}
          {loggedOut && !error && <p className="positive">Sesión cerrada.</p>}

          <input type="hidden" name="next" value={next} />
          <label className="field">
            Usuario
            <input name="username" autoComplete="username" required autoFocus disabled={!config.ok} />
          </label>
          <label className="field">
            Contraseña
            <input name="password" type="password" autoComplete="current-password" required disabled={!config.ok} />
          </label>
          <button className="primary" type="submit" disabled={!config.ok}>
            Entrar
          </button>
          <p className="muted">RN-10 · Solo usuarios autenticados acceden a la plataforma.</p>
        </form>
      </main>
    </div>
  )
}
