import { beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '@/lib/db'
import { noParams } from '@/lib/http'
import {
  createTestDb,
  createUser,
  jsonRequest,
  stubSessionProvider,
} from '../../../supabase/tests/harness'
import { stateRoute } from './api'

let db: Db

beforeAll(async () => {
  db = await createTestDb()
})

describe('state route', () => {
  it('requires a session and returns the state with the mode', async () => {
    const userId = await createUser(db)
    const routeFor = (id: string | null) =>
      stateRoute({
        getProvider: async () => stubSessionProvider(id),
        getDatabase: async () => db,
        clock: () => 1,
        mode: () => 'demo',
      })
    expect((await routeFor(null)(jsonRequest('GET', '/api/state'), noParams)).status).toBe(401)
    const body = (await (
      await routeFor(userId)(jsonRequest('GET', '/api/state'), noParams)
    ).json()) as { mode: string; serverNow: number; profile: { userId: string } }
    expect(body).toMatchObject({ mode: 'demo', serverNow: 1, profile: { userId } })
  })
})
