import { describe, expect, it, vi } from 'vitest'
import { noParams } from '@/lib/http'
import { jsonRequest, stubSessionProvider } from '../../../supabase/tests/harness'
import { demoRunRoute } from './demo-api'

describe('demo run route', () => {
  it('runs only for signed-in visitors in demo mode', async () => {
    const run = vi.fn(async () => ({ ran: true }))
    expect(
      (
        await demoRunRoute(
          async () => stubSessionProvider(null),
          () => true,
          run,
        )(jsonRequest('POST', '/api/demo/run-jobs'), noParams)
      ).status,
    ).toBe(401)
    expect(
      (
        await demoRunRoute(
          async () => stubSessionProvider('u'),
          () => false,
          run,
        )(jsonRequest('POST', '/api/demo/run-jobs'), noParams)
      ).status,
    ).toBe(404)
    const ok = await demoRunRoute(
      async () => stubSessionProvider('u'),
      () => true,
      run,
    )(jsonRequest('POST', '/api/demo/run-jobs'), noParams)
    expect(await ok.json()).toEqual({ ran: true })
    expect(run).toHaveBeenCalledTimes(1)
  })
})
