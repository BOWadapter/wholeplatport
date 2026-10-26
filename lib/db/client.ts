// Conexión a PostgreSQL. Se activa solo si existe DATABASE_URL; sin ella, la app funciona igual
// pero la pantalla de Corridas avisa que la base no está configurada.

import { Pool, type PoolClient } from 'pg'
import { MIGRATIONS } from './migrations'

let pool: Pool | null = null
let migrated: Promise<void> | null = null

export function isDbConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.DATABASE_URL)
}

export function getPool(): Pool {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL no está configurada.')
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 5 })
  return pool
}

/** Aplica las migraciones pendientes. Un candado evita que dos procesos migren a la vez. */
export async function migrate(client: PoolClient): Promise<string[]> {
  const applied: string[] = []
  await client.query('SELECT pg_advisory_lock(727001)')
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`)
    const { rows } = await client.query<{ id: string }>('SELECT id FROM schema_migrations')
    const done = new Set(rows.map((r) => r.id))
    for (const m of MIGRATIONS) {
      if (done.has(m.id)) continue
      await client.query('BEGIN')
      try {
        await client.query(m.sql)
        await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [m.id])
        await client.query('COMMIT')
        applied.push(m.id)
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(727001)')
  }
  return applied
}

/** Ejecuta `fn` con un cliente del pool, asegurando antes que el esquema esté al día. */
export async function withDb<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const p = getPool()
  migrated ??= p
    .connect()
    .then(async (client) => {
      try {
        await migrate(client)
      } finally {
        client.release()
      }
    })
    .catch((error) => {
      migrated = null // reintentar en la siguiente petición
      throw error
    })
  await migrated
  const client = await p.connect()
  try {
    return await fn(client)
  } finally {
    client.release()
  }
}

/** Cierra el pool (pruebas). */
export async function closeDb(): Promise<void> {
  await pool?.end()
  pool = null
  migrated = null
}
