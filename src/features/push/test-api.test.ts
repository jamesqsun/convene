import { expect, it, vi } from 'vitest'
import { noParams } from '@/lib/http'
import {
  createTestDb,
  createUser,
  jsonRequest,
  stubSessionProvider,
} from '../../../supabase/tests/harness'
import { testPushRoute } from './test-api'
import type { PushSender } from './provider'

it('tests only the signed-in device, rejects simulated sending, and reports acceptance accurately', async () => {
  const db = await createTestDb(),
    owner = await createUser(db),
    outsider = await createUser(db)
  const endpoint = 'https://web.push.apple.com/test'
  await db.query(
    "insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, 'k', 'a')",
    [owner, endpoint],
  )
  const send = vi.fn<PushSender['send']>(async () => ({ status: 'sent', statusCode: 201 }))
  const route = (user: string | null, kind: PushSender['kind'] = 'web_push') =>
    testPushRoute({
      getDatabase: async () => db,
      getProvider: async () => stubSessionProvider(user),
      getPush: () => ({ kind, send }),
    })
  const req = () => jsonRequest('POST', '/api/push/test', { endpoint })
  expect((await route(null)(req(), noParams)).status).toBe(401)
  expect((await route(outsider)(req(), noParams)).status).toBe(404)
  expect((await route(owner, 'fake')(req(), noParams)).status).toBe(503)
  expect(send).not.toHaveBeenCalled()
  expect(await (await route(owner)(req(), noParams)).json()).toEqual({
    status: 'accepted',
    statusCode: 201,
  })
  send.mockResolvedValue({ status: 'failed', statusCode: 403, error: 'vapid rejected' })
  expect((await route(owner)(req(), noParams)).status).toBe(502)
  send.mockResolvedValue({ status: 'gone', statusCode: 410 })
  expect((await route(owner)(req(), noParams)).status).toBe(410)
  expect((await route(owner)(req(), noParams)).status).toBe(404)
})
