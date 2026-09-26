import { beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '@/lib/db'
import { noParams } from '@/lib/http'
import {
  createTestDb,
  createUser,
  jsonRequest,
  stubSessionProvider,
} from '../../../supabase/tests/harness'
import { graphRoute } from './api'

let db: Db

beforeAll(async () => {
  db = await createTestDb()
})

describe('graph route', () => {
  it('requires a session and returns nodes with the server clock', async () => {
    const userId = await createUser(db)
    const routeFor = (id: string | null) =>
      graphRoute({
        getProvider: async () => stubSessionProvider(id),
        getDatabase: async () => db,
        clock: () => 5,
      })
    expect((await routeFor(null)(jsonRequest('GET', '/api/graph'), noParams)).status).toBe(401)
    expect(
      await (await routeFor(userId)(jsonRequest('GET', '/api/graph'), noParams)).json(),
    ).toEqual({ serverNow: 5, nodes: [] })
  })
})
