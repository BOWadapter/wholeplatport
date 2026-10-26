// GET  /api/runs  · corridas guardadas del usuario
// POST /api/runs  · guarda la simulación actual { name, state } (RN-11)

import type { NextRequest } from 'next/server'
import type { SimState } from '@/lib/engine'
import { dbFailure, guard, json } from '@/lib/db/api'
import { withDb } from '@/lib/db/client'
import { listRuns, RunLimitError, saveRun } from '@/lib/db/runs'
import { cleanRunName, MAX_STATE_BYTES, validateSimState } from '@/lib/db/snapshot'

export async function GET(request: NextRequest) {
  const g = await guard(request)
  if ('error' in g) return g.error
  try {
    return json({ configured: true, runs: await withDb((db) => listRuns(db, g.user)) })
  } catch (error) {
    return dbFailure(error)
  }
}

export async function POST(request: NextRequest) {
  const g = await guard(request, true)
  if ('error' in g) return g.error

  const raw = await request.text()
  if (raw.length > MAX_STATE_BYTES) return json({ error: 'La corrida es demasiado grande para guardarse.' }, 413)
  let body: { name?: unknown; state?: unknown }
  try {
    body = JSON.parse(raw)
  } catch {
    return json({ error: 'JSON inválido.' }, 400)
  }

  const name = cleanRunName(body.name)
  if (!name) return json({ error: 'El nombre debe tener entre 1 y 80 caracteres.' }, 400)
  const problem = validateSimState(body.state)
  if (problem) return json({ error: problem }, 400)

  try {
    const run = await withDb((db) => saveRun(db, g.user, name, body.state as SimState))
    return json({ run }, 201)
  } catch (error) {
    if (error instanceof RunLimitError) return json({ error: error.message }, 409)
    return dbFailure(error)
  }
}
