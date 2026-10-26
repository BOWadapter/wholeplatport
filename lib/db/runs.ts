// Repositorio de corridas (RN-11). Toda consulta filtra por `owner`: cada usuario solo ve lo suyo.

import type { PoolClient } from 'pg'
import type { SimState } from '../engine'
import { MAX_RUNS_PER_USER, summarize, type RunSummary } from './snapshot'

export class RunLimitError extends Error {}

interface SimulationRow {
  id: string
  name: string
  seed: string
  scenario: RunSummary['scenario']
  tick: number
  equity: string
  max_drawdown: string
  breaker_status: RunSummary['breakerStatus']
  orders: string
  decisions: string
  risk_events: string
  updated_at: Date
}

function toSummary(r: SimulationRow): RunSummary {
  const equity = Number(r.equity)
  return {
    id: Number(r.id),
    name: r.name,
    seed: Number(r.seed),
    scenario: r.scenario,
    tick: r.tick,
    equity,
    pnl: equity - 10_000,
    maxDrawdown: Number(r.max_drawdown),
    breakerStatus: r.breaker_status,
    orders: Number(r.orders),
    decisions: Number(r.decisions),
    riskEvents: Number(r.risk_events),
    updatedAt: r.updated_at.toISOString(),
  }
}

const SUMMARY_SQL = `
  SELECT s.id, s.name, s.seed, s.scenario, s.tick, s.equity, s.max_drawdown, s.breaker_status, s.updated_at,
         (SELECT count(*) FROM orders o WHERE o.simulation_id = s.id)      AS orders,
         (SELECT count(*) FROM decisions d WHERE d.simulation_id = s.id)   AS decisions,
         (SELECT count(*) FROM risk_events e WHERE e.simulation_id = s.id) AS risk_events
  FROM simulations s`

export async function listRuns(db: PoolClient, owner: string): Promise<RunSummary[]> {
  const { rows } = await db.query<SimulationRow>(`${SUMMARY_SQL} WHERE s.owner = $1 ORDER BY s.updated_at DESC`, [
    owner,
  ])
  return rows.map(toSummary)
}

/**
 * Guarda la corrida. Si ya existe una con el mismo nombre para este usuario, la reemplaza completa.
 * Todo ocurre en una transacción: o se guarda la corrida con todas sus filas, o nada.
 */
export async function saveRun(db: PoolClient, owner: string, name: string, sim: SimState): Promise<RunSummary> {
  const s = summarize(sim)
  await db.query('BEGIN')
  try {
    const existing = await db.query<{ id: string }>('SELECT id FROM simulations WHERE owner = $1 AND name = $2', [
      owner,
      name,
    ])
    if (existing.rowCount === 0) {
      const { rows } = await db.query<{ n: string }>('SELECT count(*) AS n FROM simulations WHERE owner = $1', [owner])
      if (Number(rows[0].n) >= MAX_RUNS_PER_USER) {
        throw new RunLimitError(`Límite de ${MAX_RUNS_PER_USER} corridas guardadas. Elimina alguna para continuar.`)
      }
    }

    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO simulations (owner, name, seed, scenario, tick, equity, max_drawdown, breaker_status, state)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (owner, name) DO UPDATE SET
         seed = EXCLUDED.seed, scenario = EXCLUDED.scenario, tick = EXCLUDED.tick, equity = EXCLUDED.equity,
         max_drawdown = EXCLUDED.max_drawdown, breaker_status = EXCLUDED.breaker_status, state = EXCLUDED.state,
         updated_at = now()
       RETURNING id`,
      [owner, name, s.seed, s.scenario, s.tick, s.equity, s.maxDrawdown, s.breakerStatus, JSON.stringify(sim)],
    )
    const id = rows[0].id

    // Reemplaza las filas hijas (en una actualización, la corrida pudo cambiar por completo).
    for (const table of ['orders', 'decisions', 'risk_events']) {
      await db.query(`DELETE FROM ${table} WHERE simulation_id = $1`, [id])
    }

    // Inserción masiva con unnest: una sola consulta por tabla, aunque haya miles de filas.
    if (sim.orders.length) {
      const o = sim.orders
      await db.query(
        `INSERT INTO orders (simulation_id, id, tick, strategy_id, asset, side, price, qty, quote, fee, decision_id)
         SELECT $1, * FROM unnest($2::text[], $3::int[], $4::text[], $5::text[], $6::text[],
                                  $7::numeric[], $8::numeric[], $9::numeric[], $10::numeric[], $11::text[])`,
        [
          id,
          o.map((x) => x.id),
          o.map((x) => x.tick),
          o.map((x) => x.strategyId),
          o.map((x) => x.asset),
          o.map((x) => x.side),
          o.map((x) => x.price),
          o.map((x) => x.qty),
          o.map((x) => x.quote),
          o.map((x) => x.fee),
          o.map((x) => x.decisionId),
        ],
      )
    }
    if (sim.decisions.length) {
      const d = sim.decisions
      await db.query(
        `INSERT INTO decisions (simulation_id, id, tick, strategy_id, asset, side, price, qty, rsi, regime,
                                vol_ratio, rule, result, detail, order_id)
         SELECT $1, * FROM unnest($2::text[], $3::int[], $4::text[], $5::text[], $6::text[], $7::numeric[],
                                  $8::numeric[], $9::numeric[], $10::text[], $11::numeric[], $12::text[],
                                  $13::text[], $14::text[], $15::text[])`,
        [
          id,
          d.map((x) => x.id),
          d.map((x) => x.tick),
          d.map((x) => x.strategyId),
          d.map((x) => x.asset),
          d.map((x) => x.side),
          d.map((x) => x.price),
          d.map((x) => x.qty),
          d.map((x) => x.rsi),
          d.map((x) => x.regime),
          d.map((x) => x.volRatio),
          d.map((x) => x.rule),
          d.map((x) => x.result),
          d.map((x) => x.detail),
          d.map((x) => x.orderId),
        ],
      )
    }
    if (sim.riskEvents.length) {
      const e = sim.riskEvents
      await db.query(
        `INSERT INTO risk_events (simulation_id, id, tick, type, threshold, value, action)
         SELECT $1, * FROM unnest($2::text[], $3::int[], $4::text[], $5::numeric[], $6::numeric[], $7::text[])`,
        [
          id,
          e.map((x) => x.id),
          e.map((x) => x.tick),
          e.map((x) => x.type),
          e.map((x) => x.threshold),
          e.map((x) => x.value),
          e.map((x) => x.action),
        ],
      )
    }

    await db.query('COMMIT')
    const saved = await db.query<SimulationRow>(`${SUMMARY_SQL} WHERE s.id = $1`, [id])
    return toSummary(saved.rows[0])
  } catch (error) {
    await db.query('ROLLBACK')
    throw error
  }
}

/** Devuelve el estado completo de una corrida del usuario, o null si no existe o es de otro usuario. */
export async function getRunState(db: PoolClient, owner: string, id: number): Promise<SimState | null> {
  const { rows } = await db.query<{ state: SimState }>('SELECT state FROM simulations WHERE id = $1 AND owner = $2', [
    id,
    owner,
  ])
  return rows[0]?.state ?? null
}

/** Elimina una corrida del usuario (y en cascada sus órdenes, decisiones y eventos). */
export async function deleteRun(db: PoolClient, owner: string, id: number): Promise<boolean> {
  const { rowCount } = await db.query('DELETE FROM simulations WHERE id = $1 AND owner = $2', [id, owner])
  return (rowCount ?? 0) > 0
}
