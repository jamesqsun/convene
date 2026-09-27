import { expect, it, vi } from 'vitest'
import { fakeAiProvider } from '@/features/ai/fake'
import { noParams } from '@/lib/http'
import {
  bookGroup,
  createTestDb,
  createUser,
  jsonRequest,
  stubSessionProvider,
} from '../../../supabase/tests/harness'
import { eventFeedbackRoute } from './event-api'

it('requires authentication and same-origin requests and validates feedback', async () => {
  const db = await createTestDb(),
    a = await createUser(db),
    b = await createUser(db)
  const { eventId } = await bookGroup(db, {
    localDate: '2026-10-03',
    startIso: '2026-10-03T18:00:00Z',
    endIso: '2026-10-03T19:00:00Z',
    nowIso: '2026-10-01T00:00:00Z',
    users: [a, b],
  })
  const route = (user: string | null) =>
    eventFeedbackRoute({
      getDatabase: async () => db,
      getProvider: async () => stubSessionProvider(user),
      getAi: fakeAiProvider,
      clock: () => Date.parse('2026-10-04T00:00:00Z'),
      schedule: () => {},
    })
  const req = (text: string) => jsonRequest('POST', '/api/feedback/event', { eventId, text })
  expect((await route(null)(req('Nice'), noParams)).status).toBe(401)
  expect((await route(a)(req('   '), noParams)).status).toBe(400)
  expect((await route(a)(req('x'.repeat(2001)), noParams)).status).toBe(400)
  const foreign = req('Nice')
  foreign.headers.set('origin', 'https://other.example')
  expect((await route(a)(foreign, noParams)).status).toBe(403)
  expect(
    (await route(a)(req('I really enjoyed the quiet cafe atmosphere.'), noParams)).status,
  ).toBe(202)
})

it('acknowledges saved feedback before calling AI and processes it after the response', async () => {
  const db = await createTestDb(),
    a = await createUser(db),
    b = await createUser(db)
  const { eventId } = await bookGroup(db, {
    localDate: '2026-10-03',
    startIso: '2026-10-03T18:00:00Z',
    endIso: '2026-10-03T19:00:00Z',
    nowIso: '2026-10-01T00:00:00Z',
    users: [a, b],
  })
  const ai = fakeAiProvider(),
    extract = vi.spyOn(ai, 'extractMemories')
  const scheduled: (() => Promise<void>)[] = []
  const route = eventFeedbackRoute({
    getDatabase: async () => db,
    getProvider: async () => stubSessionProvider(a),
    getAi: () => ai,
    clock: () => Date.parse('2026-10-04T00:00:00Z'),
    schedule: (work) => {
      scheduled.push(work)
    },
  })
  const response = await route(
    jsonRequest('POST', '/api/feedback/event', {
      eventId,
      text: 'I prefer quiet places where I can hear everyone.',
    }),
    noParams,
  )
  expect(response.status).toBe(202)
  expect((await response.json()).feedback.memoriesUpdated).toBe(false)
  expect(extract).not.toHaveBeenCalled()
  expect(scheduled).toHaveLength(1)
  await scheduled[0]!()
  expect(extract).toHaveBeenCalledTimes(1)
  expect(
    (
      await db.query<{ memories_updated: boolean }>('select memories_updated from event_feedback')
    )[0]!.memories_updated,
  ).toBe(true)
})
