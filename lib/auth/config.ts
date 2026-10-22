// Configuración de acceso (RN-10). Las credenciales viven SOLO en variables de entorno (.env),
// nunca en el código ni en el repositorio.
//
//   AUTH_USERNAME  usuario permitido
//   AUTH_PASSWORD  contraseña (mínimo 8 caracteres)
//   AUTH_SECRET    clave para firmar la cookie de sesión (mínimo 32 caracteres)
//
// Falla cerrado: si falta alguna o no cumple el mínimo, nadie puede entrar.

export interface AuthConfig {
  username: string
  password: string
  secret: string
}

export type AuthConfigResult = { ok: true; config: AuthConfig } | { ok: false; problem: string }

export const MIN_PASSWORD_LENGTH = 8
export const MIN_SECRET_LENGTH = 32

export function readAuthConfig(env: Record<string, string | undefined> = process.env): AuthConfigResult {
  const username = env.AUTH_USERNAME?.trim() ?? ''
  const password = env.AUTH_PASSWORD ?? ''
  const secret = env.AUTH_SECRET ?? ''

  const missing = [!username && 'AUTH_USERNAME', !password && 'AUTH_PASSWORD', !secret && 'AUTH_SECRET'].filter(
    Boolean,
  )
  if (missing.length) return { ok: false, problem: `faltan las variables ${missing.join(', ')}.` }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, problem: `AUTH_PASSWORD debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.` }
  }
  if (secret.length < MIN_SECRET_LENGTH) {
    return { ok: false, problem: `AUTH_SECRET debe tener al menos ${MIN_SECRET_LENGTH} caracteres.` }
  }
  return { ok: true, config: { username, password, secret } }
}
