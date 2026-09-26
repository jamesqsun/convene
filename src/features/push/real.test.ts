import { describe, expect, it, vi } from 'vitest'
import { WebPushError } from 'web-push'
import { pushTtlSeconds, webPushSender } from './real'

const vapid = { publicKey: 'pub', privateKey: 'priv', subject: 'mailto:ops@example.com' }
const subscription = { endpoint: 'https://push.example/abc', p256dh: 'k', auth: 'a' }

describe('webPushSender', () => {
  it('sends with VAPID details and a TTL', async () => {
    const sendImpl = vi.fn(async () => ({ statusCode: 201, body: '', headers: {} }))
    const outcome = await webPushSender(vapid, sendImpl as never).send(
      subscription,
      '{"title":"hi"}',
    )
    expect(outcome).toEqual({ status: 'sent', statusCode: 201 })
    expect(sendImpl).toHaveBeenCalledWith(
      { endpoint: subscription.endpoint, keys: { p256dh: 'k', auth: 'a' } },
      '{"title":"hi"}',
      {
        TTL: pushTtlSeconds,
        vapidDetails: { subject: vapid.subject, publicKey: 'pub', privateKey: 'priv' },
      },
    )
  })

  it('maps 404 and 410 to gone and other errors to failed', async () => {
    const gone = vi.fn(async () => {
      throw new WebPushError('gone', 410, {}, '', subscription.endpoint)
    })
    expect(await webPushSender(vapid, gone as never).send(subscription, '{}')).toEqual({
      status: 'gone',
      statusCode: 410,
    })
    const serverError = vi.fn(async () => {
      throw new WebPushError('boom', 500, {}, '', subscription.endpoint)
    })
    expect(await webPushSender(vapid, serverError as never).send(subscription, '{}')).toMatchObject(
      { status: 'failed', statusCode: 500 },
    )
    const network = vi.fn(async () => {
      throw new Error('ECONNRESET')
    })
    expect(await webPushSender(vapid, network as never).send(subscription, '{}')).toEqual({
      status: 'failed',
      statusCode: null,
      error: 'ECONNRESET',
    })
  })
})
