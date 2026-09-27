import { beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '@/lib/db'
import {
  bookGroup,
  createTestDb,
  createUser,
  jsonRequest,
  stubSessionProvider,
  withParams,
} from '../../../supabase/tests/harness'
import { fakePushSender } from '@/features/push/fake'
import { eventRoutes } from './api'

let db: Db
let a: string
let b: string
let eventId: string
const now = Date.parse('2026-10-01T12:00:00Z')

beforeAll(async () => {
  db = await createTestDb()
  a = await createUser(db, { name: 'Ann' })
  b = await createUser(db, { name: 'Ben' })
  const c = await createUser(db, { name: 'Cam' })
  eventId = (
    await bookGroup(db, {
      localDate: '2026-10-03',
      startIso: '2026-10-03T22:00:00Z',
      endIso: '2026-10-03T23:00:00Z',
      nowIso: '2026-10-01T00:00:00Z',
      users: [a, b, c],
    })
  ).eventId
  await db.query(
    "insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://push/b', 'k', 'x')",
    [b],
  )
})

describe('event routes', () => {
  it('returns the matching completed hangout for an old notification link', async () => {
    const routesFor = (id: string) =>
      eventRoutes({
        getProvider: async () => stubSessionProvider(id),
        getDatabase: async () => db,
        getPush: fakePushSender,
        getCalendar: () => null,
        tokenSecret: () => 'x'.repeat(32),
        clock: () => Date.parse('2026-10-04T12:00:00Z'),
      })
    const response = await routesFor(a).detail(
      jsonRequest('GET', `/api/plans/${eventId}`),
      withParams({ eventId }),
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ hangout: { eventId, activityName: 'Coffee' } })
    const outsider = await createUser(db)
    expect(
      (
        await routesFor(outsider).detail(
          jsonRequest('GET', `/api/plans/${eventId}`),
          withParams({ eventId }),
        )
      ).status,
    ).toBe(404)
  })
  it('returns plan detail to participants only and withdraws with a push drain', async () => {
    const push = fakePushSender()
    const routesFor = (id: string | null) =>
      eventRoutes({
        getProvider: async () => stubSessionProvider(id),
        getDatabase: async () => db,
        getPush: () => push,
        getCalendar: () => null,
        tokenSecret: () => 'x'.repeat(32),
        clock: () => now,
      })
    const detail = await routesFor(a).detail(
      jsonRequest('GET', `/api/plans/${eventId}`),
      withParams({ eventId }),
    )
    expect(detail.status).toBe(200)
    expect(
      (
        await routesFor(await createUser(db)).detail(
          jsonRequest('GET', `/api/plans/${eventId}`),
          withParams({ eventId }),
        )
      ).status,
    ).toBe(404)
    expect(
      (
        await routesFor(null).detail(
          jsonRequest('GET', `/api/plans/${eventId}`),
          withParams({ eventId }),
        )
      ).status,
    ).toBe(401)
    expect(
      (
        await routesFor(a).detail(
          jsonRequest('GET', '/api/plans/nope'),
          withParams({ eventId: 'nope' }),
        )
      ).status,
    ).toBe(404)

    // Assignment pushes are already pending; drain them first so the withdrawal push is isolated.
    await routesFor(a).withdraw(
      jsonRequest('POST', `/api/plans/${eventId}/withdraw`),
      withParams({ eventId }),
    )
    const sentBefore = push.sent.length
    expect(sentBefore).toBeGreaterThan(0)
    const withdrawn = await routesFor(a).withdraw(
      jsonRequest('POST', `/api/plans/${eventId}/withdraw`),
      withParams({ eventId }),
    )
    expect(await withdrawn.json()).toEqual({ result: 'already_withdrawn', remaining: 2 })
    expect(
      (
        await routesFor(a).detail(
          jsonRequest('GET', `/api/plans/${eventId}`),
          withParams({ eventId }),
        )
      ).status,
    ).toBe(404)
    const payloads = push.sent.map((s) => JSON.parse(s.payload) as { title: string })
    expect(payloads.some((p) => p.title === 'Someone left your plan')).toBe(true)
  })
})
