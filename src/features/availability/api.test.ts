import { beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '@/lib/db'
import { noParams } from '@/lib/http'
import { zonedTime } from '@/lib/time'
import {
  createTestDb,
  createUser,
  jsonRequest,
  stubSessionProvider,
  withParams,
} from '../../../supabase/tests/harness'
import { availabilityRoutes } from './api'

let db: Db
let userId: string
const now = zonedTime('America/Toronto', '2026-09-28', 9)

beforeAll(async () => {
  db = await createTestDb()
  userId = await createUser(db)
})

const routesFor = (id: string | null) =>
  availabilityRoutes({
    getProvider: async () => stubSessionProvider(id),
    getDatabase: async () => db,
    clock: () => now,
  })
const input = { date: '2026-10-03', startTime: '18:00', endTime: '21:00' }

describe('availability routes', () => {
  it('walks a slot through its lifecycle', async () => {
    const routes = routesFor(userId)
    const created = await routes.create(jsonRequest('POST', '/api/availability', input), noParams)
    expect(created.status).toBe(201)
    const { slot } = (await created.json()) as {
      slot: { id: string; state: string; expectedBatchAt: number; revision: number }
    }
    expect(slot.state).toBe('waiting')
    expect(slot.expectedBatchAt).toBe(zonedTime('America/Toronto', '2026-10-01'))

    expect(
      (
        await routes.create(
          jsonRequest('POST', '/api/availability', {
            ...input,
            startTime: '20:00',
            endTime: '22:00',
          }),
          noParams,
        )
      ).status,
    ).toBe(409)
    expect(
      (
        await routes.create(
          jsonRequest('POST', '/api/availability', { ...input, budget: 5 }),
          noParams,
        )
      ).status,
    ).toBe(400)
    expect(
      (
        await routes.create(
          jsonRequest('POST', '/api/availability', {
            date: '2026-09-29',
            startTime: '18:00',
            endTime: '21:00',
          }),
          noParams,
        )
      ).status,
    ).toBe(422)

    const edited = (await (
      await routes.update(
        jsonRequest('PATCH', `/api/availability/${slot.id}`, { ...input, endTime: '22:00' }),
        withParams({ id: slot.id }),
      )
    ).json()) as { slot: { revision: number } }
    expect(edited.slot.revision).toBe(2)
    const paused = (await (
      await routes.pause(
        jsonRequest('POST', `/api/availability/${slot.id}/pause`),
        withParams({ id: slot.id }),
      )
    ).json()) as { slot: { state: string } }
    expect(paused.slot.state).toBe('paused')
    const reopened = (await (
      await routes.reopen(
        jsonRequest('POST', `/api/availability/${slot.id}/reopen`),
        withParams({ id: slot.id }),
      )
    ).json()) as { slot: { state: string } }
    expect(reopened.slot.state).toBe('waiting')
    expect(
      (
        await routes.remove(
          jsonRequest('DELETE', `/api/availability/${slot.id}`),
          withParams({ id: slot.id }),
        )
      ).status,
    ).toBe(204)
    expect(
      (
        await routes.pause(
          jsonRequest('POST', `/api/availability/${slot.id}/pause`),
          withParams({ id: slot.id }),
        )
      ).status,
    ).toBe(409)
    expect(
      (
        await routes.pause(
          jsonRequest('POST', '/api/availability/nope/pause'),
          withParams({ id: 'nope' }),
        )
      ).status,
    ).toBe(404)
  })

  it('requires a session and a chosen city', async () => {
    expect(
      (await routesFor(null).create(jsonRequest('POST', '/api/availability', input), noParams))
        .status,
    ).toBe(401)
    const cityless = await createUser(db, { isOnboarded: false })
    await db.query('update profiles set city_key = null, city_timezone = null where id = $1', [
      cityless,
    ])
    expect(
      (await routesFor(cityless).create(jsonRequest('POST', '/api/availability', input), noParams))
        .status,
    ).toBe(409)
  })
})
