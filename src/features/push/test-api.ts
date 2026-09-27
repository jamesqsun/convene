import { z } from 'zod'
import { authedMutation, sessionProvider, type SessionProvider } from '@/features/auth/session'
import { getDb, type Db } from '@/lib/db'
import { getProviders } from '@/lib/providers'
import { HttpError, jsonResponse, readJson } from '@/lib/http'
import type { PushSender, PushSubscriptionRecord } from './provider'

export function testPushRoute(deps: {
  getProvider: () => Promise<SessionProvider>
  getDatabase: () => Promise<Db>
  getPush: () => PushSender
}) {
  return authedMutation(async (request, userId) => {
    const { endpoint } = await readJson(request, z.object({ endpoint: z.url().max(4096) }).strict())
    const push = deps.getPush()
    if (push.kind !== 'web_push')
      throw new HttpError(
        503,
        'push_not_configured',
        'This server is using simulated push. Configure VAPID keys for Production and redeploy.',
      )
    const db = await deps.getDatabase()
    const [subscription] = await db.query<PushSubscriptionRecord>(
      'select endpoint, p256dh, auth from push_subscriptions where user_id = $1 and endpoint = $2 and retired_at is null',
      [userId, endpoint],
    )
    if (!subscription)
      throw new HttpError(
        404,
        'subscription_missing',
        'This device is not registered. Enable notifications again.',
      )
    const result = await push.send(
      subscription,
      JSON.stringify({
        title: 'Convene test notification',
        body: 'Push notifications are working on this device.',
        url: '/profile',
        tag: `convene-test:${Date.now()}`,
      }),
    )
    if (result.status === 'gone') {
      await db.query(
        'update push_subscriptions set retired_at = now() where user_id = $1 and endpoint = $2',
        [userId, endpoint],
      )
      throw new HttpError(
        410,
        'subscription_expired',
        'This push subscription expired. Re-enable notifications on this device.',
      )
    }
    if (result.status === 'failed') {
      console.warn('[push] test rejected:', result)
      throw new HttpError(
        502,
        'push_rejected',
        `Push service rejected the test${result.statusCode ? ` (HTTP ${result.statusCode})` : ''}. Check the deployed VAPID settings and server logs.`,
      )
    }
    return jsonResponse({ status: 'accepted', statusCode: result.statusCode })
  }, deps.getProvider)
}
export const POST = testPushRoute({
  getProvider: sessionProvider,
  getDatabase: getDb,
  getPush: () => getProviders().push,
})
