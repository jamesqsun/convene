import webpush, { WebPushError } from 'web-push'
import type { VapidConfig } from '@/lib/env'
import type { PushOutcome, PushSender, PushSubscriptionRecord } from './provider'

/** Time-to-live for queued pushes: a day-old assignment notice is still worth delivering. */
export const pushTtlSeconds = 24 * 3600

type SendImpl = typeof webpush.sendNotification

export function webPushSender(
  vapid: VapidConfig,
  sendImpl: SendImpl = webpush.sendNotification,
): PushSender {
  return {
    kind: 'web_push',
    async send(subscription: PushSubscriptionRecord, payload: string): Promise<PushOutcome> {
      try {
        const result = await sendImpl(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          payload,
          {
            TTL: pushTtlSeconds,
            vapidDetails: {
              subject: vapid.subject,
              publicKey: vapid.publicKey,
              privateKey: vapid.privateKey,
            },
          },
        )
        return { status: 'sent', statusCode: result.statusCode }
      } catch (error) {
        return outcomeFromError(error)
      }
    },
  }
}

function outcomeFromError(error: unknown): PushOutcome {
  if (error instanceof WebPushError) {
    if (error.statusCode === 404 || error.statusCode === 410)
      return { status: 'gone', statusCode: error.statusCode }
    return { status: 'failed', statusCode: error.statusCode, error: error.message }
  }
  return {
    status: 'failed',
    statusCode: null,
    error: error instanceof Error ? error.message : String(error),
  }
}
