import { expect, it, vi } from 'vitest'
import { readEnv } from '@/lib/env'
import { noParams } from '@/lib/http'
import { createTestDb, createUser } from '../../../supabase/tests/harness'
import { cityInterestsHandler } from './city-api'

it('authenticates cron GET and force POST before queueing, and schedules delivery', async () => {
  const db = await createTestDb()
  await createUser(db)
  const base = readEnv({
    CONVENE_MODE: 'supabase',
    DATABASE_URL: 'postgres://test/db',
    NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test',
    SUPABASE_SERVICE_ROLE_KEY: 'test',
    CRON_SECRET: 'long-test-secret-value',
  })
  if (base.mode !== 'supabase') throw new Error('env')
  const env = {
    ...base,
    meta: { apiKey: 'test', model: 'muse-spark-1.3' },
    vapid: { publicKey: 'test', privateKey: 'test', subject: 'mailto:test@example.com' },
  }
  const search = vi.fn(async () => null),
    deliver = vi.fn(),
    deps = { db: async () => db, search, deliver, clock: Date.now }
  const handler = cityInterestsHandler(env, deps)
  const req = (method = 'GET', body?: string) =>
    new Request('http://localhost/api/jobs/city-interests', {
      method,
      headers: {
        authorization: 'Bearer long-test-secret-value',
        'content-type': 'application/json',
      },
      ...(body ? { body } : {}),
    })
  expect(
    (await handler(new Request('http://localhost/api/jobs/city-interests'), noParams)).status,
  ).toBe(401)
  expect((await handler(req('POST', '{"userId":"bad"}'), noParams)).status).toBe(400)
  expect(search).not.toHaveBeenCalled()
  expect((await handler(req(), noParams)).status).toBe(200)
  expect(deliver).toHaveBeenCalledTimes(1)
  expect((await handler(req('POST', '{"force":true}'), noParams)).status).toBe(200)
  expect(search).toHaveBeenCalledTimes(2)
  expect((await cityInterestsHandler(base, deps)(req(), noParams)).status).toBe(503)
})
