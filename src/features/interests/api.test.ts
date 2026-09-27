import { expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  createTestDb,
  createUser,
  jsonRequest,
  stubSessionProvider,
  count,
} from '../../../supabase/tests/harness'
import { fakeAiProvider } from '@/features/ai/fake'
import { fictionalVenueProvider } from '@/features/planning/venues/fictional'
import { readEnv } from '@/lib/env'
import { noParams } from '@/lib/http'
import { broadcastRoute, interestRoutes } from './api'
import { listInterestPrompts } from './store'
import type { PushSender } from '@/features/push/provider'
import { drainNotificationJobs } from '@/features/push/sender'
import { broadcastInterest } from './store'

it('keeps a worker from reclaiming a broadcast while its delivery is in progress', async () => {
  const db = await createTestDb(),
    userId = await createUser(db),
    id = randomUUID(),
    now = Date.now()
  await db.query(
    "insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://push/concurrent', 'k', 'a')",
    [userId],
  )
  await broadcastInterest(db, id, 'An upcoming concert', now)
  let release!: () => void
  let started!: () => void
  const sending = new Promise<void>((resolve) => {
    started = resolve
  })
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const send = vi.fn<PushSender['send']>(async () => {
    started()
    await gate
    return { status: 'sent', statusCode: 201 }
  })
  const push: PushSender = { kind: 'web_push', send }
  const delivery = drainNotificationJobs(db, push, now, 50, id)
  await sending
  try {
    expect((await drainNotificationJobs(db, push, now)).claimed).toBe(0)
  } finally {
    release()
    await delivery
  }
  expect(send).toHaveBeenCalledTimes(1)
})

it('authenticates broadcasts, delivers topic links, and answers asynchronously for recipients only', async () => {
  const db = await createTestDb(),
    userId = await createUser(db),
    outsider = await createUser(db)
  await db.query(
    "insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://push/device', 'k', 'a')",
    [userId],
  )
  const tasks: (() => Promise<void>)[] = []
  const send = vi.fn<PushSender['send']>(async () => ({ status: 'sent', statusCode: 201 }))
  const ai = fakeAiProvider(),
    embed = vi.spyOn(ai, 'embed')
  const deps = {
    getDatabase: async () => db,
    getProvider: async () => stubSessionProvider(userId),
    providers: () => ({
      ai,
      venues: fictionalVenueProvider(),
      calendar: null,
      push: { kind: 'web_push' as const, send },
    }),
    clock: Date.now,
    schedule: (work: () => Promise<void>) => {
      tasks.push(work)
    },
  }
  const env = readEnv({
    CONVENE_MODE: 'supabase',
    DATABASE_URL: 'postgresql://u:p@h/db',
    NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'pk',
    SUPABASE_SERVICE_ROLE_KEY: 'sk',
    CRON_SECRET: 'a-long-random-secret',
  })
  const id = randomUUID(),
    text = 'A music festival this weekend'
  const req = () => jsonRequest('POST', '/api/jobs/send-interest', { requestId: id, text })
  expect((await broadcastRoute(env, deps)(req(), noParams)).status).toBe(401)
  expect(await count(db, 'interest_prompts')).toBe(0)
  const authorized = req()
  authorized.headers.set('authorization', 'Bearer a-long-random-secret')
  expect((await broadcastRoute(env, deps)(authorized, noParams)).status).toBe(202)
  expect(send).not.toHaveBeenCalled()
  await tasks.shift()!()
  expect(send).toHaveBeenCalledWith(expect.anything(), expect.stringContaining(`/interests/${id}`))
  const params = { params: Promise.resolve({ id }) }
  const answerRequest = () => jsonRequest('POST', `/api/interests/${id}`, { answer: 'yes' })
  expect(
    (
      await interestRoutes({ ...deps, getProvider: async () => stubSessionProvider(null) }).answer(
        answerRequest(),
        params,
      )
    ).status,
  ).toBe(401)
  expect(
    (
      await interestRoutes({
        ...deps,
        getProvider: async () => stubSessionProvider(outsider),
      }).answer(answerRequest(), params)
    ).status,
  ).toBe(404)
  const foreign = answerRequest()
  foreign.headers.set('origin', 'https://other.example')
  expect((await interestRoutes(deps).answer(foreign, params)).status).toBe(403)
  expect((await interestRoutes(deps).answer(answerRequest(), params)).status).toBe(202)
  expect(embed).not.toHaveBeenCalled()
  await tasks.shift()!()
  expect(embed).toHaveBeenCalledTimes(1)
  expect((await listInterestPrompts(db, userId, Date.now(), id))[0]!.memoriesUpdated).toBe(true)
})
