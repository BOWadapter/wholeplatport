// GET    /api/runs/:id · estado completo de una corrida del usuario, para restaurarla
// DELETE /api/runs/:id · elimina la corrida y, en cascada, sus órdenes, decisiones y eventos

import type { NextRequest } from 'next/server'
import { dbFailure, guard, json } from '@/lib/db/api'
import { withDb } from '@/lib/db/client'
import { deleteRun, getRunState } from '@/lib/db/runs'

type Params = { params: Promise<{ id: string }> }

function parseId(raw: string): number | null {
  return /^\d{1,15}$/.test(raw) ? Number(raw) : null
}

export async function GET(request: NextRequest, { params }: Params) {
  const g = await guard(request)
  if ('error' in g) return g.error
  const id = parseId((await params).id)
  if (id === null) return json({ error: 'Corrida no encontrada.' }, 404)
  try {
    const state = await withDb((db) => getRunState(db, g.user, id))
    return state ? json({ state }) : json({ error: 'Corrida no encontrada.' }, 404)
  } catch (error) {
    return dbFailure(error)
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const g = await guard(request, true)
  if ('error' in g) return g.error
  const id = parseId((await params).id)
  if (id === null) return json({ error: 'Corrida no encontrada.' }, 404)
  try {
    const deleted = await withDb((db) => deleteRun(db, g.user, id))
    return deleted ? json({ deleted: true }) : json({ error: 'Corrida no encontrada.' }, 404)
  } catch (error) {
    return dbFailure(error)
  }
}
