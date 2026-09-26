import { describe, expect, it, vi } from 'vitest'
import { readEnv } from '@/lib/env'
import { noParams } from '@/lib/http'
import { jobsHandler } from './api'

const connected = readEnv({
  CONVENE_MODE: 'supabase',
  DATABASE_URL: 'postgresql://u:p@h/db',
  NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'pk',
  SUPABASE_SERVICE_ROLE_KEY: 'sk',
  CRON_SECRET: 'a-very-long-random-secret',
})

const post = (authorization?: string) =>
  new Request('http://localhost:3000/api/jobs/run', {
    method: 'POST',
    headers: authorization ? { authorization } : {},
  })

describe('jobs route', () => {
  it('is hidden in demo mode', async () => {
    const run = vi.fn(async () => ({}))
    expect((await jobsHandler({ mode: 'demo' }, run)(post('Bearer x'), noParams)).status).toBe(404)
    expect(run).not.toHaveBeenCalled()
  })

  it('requires the exact cron secret and returns the tick summary', async () => {
    const run = vi.fn(async () => ({ expiredSlots: 0 }))
    const handler = jobsHandler(connected, run)
    expect((await handler(post(), noParams)).status).toBe(401)
    expect((await handler(post('Bearer wrong'), noParams)).status).toBe(401)
    const ok = await handler(post('Bearer a-very-long-random-secret'), noParams)
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ expiredSlots: 0 })
    expect(run).toHaveBeenCalledTimes(1)
  })
})
