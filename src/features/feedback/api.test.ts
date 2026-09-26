import { beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '@/lib/db'
import { noParams } from '@/lib/http'
import {
  backdateEvent,
  bookGroup,
  createTestDb,
  createUser,
  jsonRequest,
  stubSessionProvider,
} from '../../../supabase/tests/harness'
import { feedbackRoute } from './api'

let db: Db

beforeAll(async () => {
  db = await createTestDb()
})

describe('feedback route', () => {
  it('validates input, requires a session, and returns only the mutual outcome', async () => {
    const [a, b] = [await createUser(db), await createUser(db)]
    const { eventId } = await bookGroup(db, {
      localDate: '2026-10-03',
      startIso: '2026-10-03T22:00:00Z',
      endIso: '2026-10-03T23:00:00Z',
      nowIso: '2026-10-01T00:00:00Z',
      users: [a, b],
    })
    await backdateEvent(db, eventId, '2026-10-03T23:00:00Z')
    const now = Date.parse('2026-10-04T12:00:00Z')
    const routeFor = (id: string | null) =>
      feedbackRoute({
        getProvider: async () => stubSessionProvider(id),
        getDatabase: async () => db,
        clock: () => now,
      })
    expect(
      (
        await routeFor(null)(
          jsonRequest('POST', '/api/feedback', { eventId, subjectUserId: b, answer: 'yes' }),
          noParams,
        )
      ).status,
    ).toBe(401)
    expect(
      (
        await routeFor(a)(
          jsonRequest('POST', '/api/feedback', { eventId, subjectUserId: b, answer: 'maybe' }),
          noParams,
        )
      ).status,
    ).toBe(400)
    const response = await routeFor(a)(
      jsonRequest('POST', '/api/feedback', { eventId, subjectUserId: b, answer: 'yes' }),
      noParams,
    )
    expect(await response.json()).toEqual({ answer: 'yes', isMutualFriend: false })
  })
})
