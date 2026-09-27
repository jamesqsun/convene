import { describe, expect, it, vi } from 'vitest'
import { readEnv } from '@/lib/env'
import { noParams } from '@/lib/http'
import { completeEventsHandler } from './complete-api'

const env = readEnv({
  CONVENE_MODE: 'supabase',
  DATABASE_URL: 'postgresql://u:p@h/db',
  NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'pk',
  SUPABASE_SERVICE_ROLE_KEY: 'sk',
  CRON_SECRET: 'a-very-long-random-secret',
})
const request = (secret = '', body = '{}') =>
  new Request('http://localhost/api/jobs/complete-events', {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}` },
    body,
  })

describe('manual completion endpoint', () => {
  it('requires connected mode and the exact secret, validates input, and returns the result', async () => {
    const run = vi.fn(async () => ({ completed: 3 }))
    expect((await completeEventsHandler({ mode: 'demo' }, run)(request(), noParams)).status).toBe(
      404,
    )
    const handler = completeEventsHandler(env, run)
    expect((await handler(request(), noParams)).status).toBe(401)
    expect((await handler(request('wrong'), noParams)).status).toBe(401)
    expect(
      (await handler(request('a-very-long-random-secret', '{"extra":true}'), noParams)).status,
    ).toBe(400)
    expect(run).not.toHaveBeenCalled()
    const response = await handler(request('a-very-long-random-secret'), noParams)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ completed: 3 })
    expect(run).toHaveBeenCalledTimes(1)
  })
})
