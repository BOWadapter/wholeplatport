// PA-10 (RN-11): las corridas se guardan en PostgreSQL y se restauran idénticas; cada usuario ve solo las suyas.
//
// Las pruebas de integración necesitan una base real (DATABASE_URL). En CI corren contra un servicio
// postgres:17; en local, con `docker compose up -d db` y DATABASE_URL apuntando a él. Sin DATABASE_URL se omiten.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PoolClient } from 'pg'
import { createSim, killSwitch, setScenario, step, stepN, type SimState } from '../lib/engine'
import { closeDb, getPool, migrate, withDb } from '../lib/db/client'
import { MIGRATIONS } from '../lib/db/migrations'
import { deleteRun, getRunState, listRuns, saveRun } from '../lib/db/runs'
import { cleanRunName, summarize, validateSimState } from '../lib/db/snapshot'

// ---------- piezas puras (siempre corren) ----------

describe('PA-10 · validación del estado antes de guardar o cargar', () => {
  it('acepta un estado real del motor', () => {
    expect(validateSimState(stepN(createSim(7), 50))).toBeNull()
  })

  it('rechaza estados ajenos, de otra versión o que no son dry-run', () => {
    const sim = createSim(7)
    expect(validateSimState(null)).not.toBeNull()
    expect(validateSimState({ ...sim, version: 2 })).not.toBeNull()
    expect(validateSimState({ ...sim, mode: 'live' })).not.toBeNull()
    expect(validateSimState({ ...sim, strategies: [] })).not.toBeNull()
    expect(validateSimState({ ...sim, market: { ...sim.market, scenario: 'luna' } })).not.toBeNull()
    expect(validateSimState({ ...sim, decisions: 'x' })).not.toBeNull()
  })

  it('normaliza el nombre de la corrida', () => {
    expect(cleanRunName('  Caída   2022  ')).toBe('Caída 2022')
    expect(cleanRunName('')).toBeNull()
    expect(cleanRunName('x'.repeat(81))).toBeNull()
    expect(cleanRunName(42)).toBeNull()
  })

  it('el resumen coincide con el estado', () => {
    const sim = stepN(createSim(7), 100)
    const s = summarize(sim)
    expect(s.tick).toBe(100)
    expect(s.orders).toBe(sim.orders.length)
    expect(s.breakerStatus).toBe(sim.breaker.status)
  })
})

// ---------- integración con PostgreSQL ----------

const hasDb = Boolean(process.env.DATABASE_URL)
const RUN = Date.now().toString(36) // aísla los datos de esta ejecución
const ALICE = `alice-${RUN}`
const BOB = `bob-${RUN}`

describe.skipIf(!hasDb)('PA-10 · persistencia en PostgreSQL', () => {
  let crash: SimState

  beforeAll(async () => {
    // Corrida con todo tipo de filas: órdenes, decisiones, resets del grid y un disparo del breaker.
    crash = setScenario(stepN(createSim(2022), 72), 'crash')
    while (crash.breaker.status === 'armado') crash = step(crash)
  })

  afterAll(async () => {
    await withDb(async (db) => {
      await db.query('DELETE FROM simulations WHERE owner IN ($1, $2)', [ALICE, BOB])
    })
    await closeDb()
  })

  it('las migraciones se aplican una vez y son idempotentes', async () => {
    const client: PoolClient = await getPool().connect()
    try {
      await migrate(client)
      expect(await migrate(client)).toEqual([])
      const { rows } = await client.query<{ id: string }>('SELECT id FROM schema_migrations ORDER BY id')
      expect(rows.map((r) => r.id)).toEqual(MIGRATIONS.map((m) => m.id))
    } finally {
      client.release()
    }
  })

  it('guarda la corrida con sus filas normalizadas', async () => {
    const run = await withDb((db) => saveRun(db, ALICE, 'caída 2022', crash))
    expect(run.tick).toBe(crash.market.tick)
    expect(run.breakerStatus).toBe('disparado')
    expect(run.orders).toBe(crash.orders.length)
    expect(run.decisions).toBe(crash.decisions.length)
    expect(run.riskEvents).toBe(crash.riskEvents.length)

    // RN-2 se conserva en SQL: toda orden tiene su decisión enlazada.
    const orphans = await withDb(async (db) => {
      const { rows } = await db.query<{ n: string }>(
        `SELECT count(*) AS n FROM orders o
         LEFT JOIN decisions d ON d.simulation_id = o.simulation_id AND d.id = o.decision_id AND d.order_id = o.id
         WHERE o.simulation_id = $1 AND d.id IS NULL`,
        [run.id],
      )
      return Number(rows[0].n)
    })
    expect(orphans).toBe(0)
  })

  it('restaura el estado idéntico y la simulación continúa igual', async () => {
    const [run] = await withDb((db) => listRuns(db, ALICE))
    const restored = await withDb((db) => getRunState(db, ALICE, run.id))
    expect(restored).toEqual(crash)
    // Determinismo: avanzar la restaurada da exactamente lo mismo que avanzar la original.
    const next = killSwitch(crash)
    expect(stepN(killSwitch(restored!), 24)).toEqual(stepN(next, 24))
  })

  it('cada usuario solo ve y modifica sus corridas', async () => {
    await withDb((db) => saveRun(db, BOB, 'de bob', createSim(1)))
    const [aliceRun] = await withDb((db) => listRuns(db, ALICE))
    const bobRuns = await withDb((db) => listRuns(db, BOB))
    expect(bobRuns.map((r) => r.name)).toEqual(['de bob'])
    expect(await withDb((db) => getRunState(db, BOB, aliceRun.id))).toBeNull()
    expect(await withDb((db) => deleteRun(db, BOB, aliceRun.id))).toBe(false)
    expect(await withDb((db) => listRuns(db, ALICE))).toHaveLength(1)
  })

  it('guardar con el mismo nombre reemplaza la corrida', async () => {
    const shorter = stepN(createSim(5), 10)
    const run = await withDb((db) => saveRun(db, ALICE, 'caída 2022', shorter))
    const runs = await withDb((db) => listRuns(db, ALICE))
    expect(runs).toHaveLength(1)
    expect(run.tick).toBe(10)
    expect(run.decisions).toBe(shorter.decisions.length)
  })

  it('eliminar borra en cascada órdenes, decisiones y eventos', async () => {
    const [run] = await withDb((db) => listRuns(db, ALICE))
    expect(await withDb((db) => deleteRun(db, ALICE, run.id))).toBe(true)
    const left = await withDb(async (db) => {
      const { rows } = await db.query<{ n: string }>(
        `SELECT (SELECT count(*) FROM orders WHERE simulation_id = $1)
              + (SELECT count(*) FROM decisions WHERE simulation_id = $1)
              + (SELECT count(*) FROM risk_events WHERE simulation_id = $1) AS n`,
        [run.id],
      )
      return Number(rows[0].n)
    })
    expect(left).toBe(0)
  })

  it('una falla a medio guardar no deja filas sueltas (transacción)', async () => {
    const broken = stepN(createSim(9), 60)
    // Rompe una restricción (side inválido) en la última orden: debe revertirse todo.
    broken.orders[broken.orders.length - 1] = { ...broken.orders.at(-1)!, side: 'robar' as never }
    await expect(withDb((db) => saveRun(db, ALICE, 'rota', broken))).rejects.toThrow()
    expect((await withDb((db) => listRuns(db, ALICE))).find((r) => r.name === 'rota')).toBeUndefined()
  })
})
