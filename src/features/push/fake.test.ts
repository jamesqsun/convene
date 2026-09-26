import { describe, expect, it } from 'vitest'
import { fakePushSender } from './fake'

describe('fakePushSender', () => {
  it('records sends and honours scripted outcomes', async () => {
    const sender = fakePushSender()
    sender.outcomes.set('https://gone', { status: 'gone', statusCode: 410 })
    expect(await sender.send({ endpoint: 'https://ok', p256dh: 'k', auth: 'a' }, 'p1')).toEqual({
      status: 'sent',
      statusCode: 201,
    })
    expect(await sender.send({ endpoint: 'https://gone', p256dh: 'k', auth: 'a' }, 'p2')).toEqual({
      status: 'gone',
      statusCode: 410,
    })
    expect(sender.sent).toEqual([
      { endpoint: 'https://ok', payload: 'p1' },
      { endpoint: 'https://gone', payload: 'p2' },
    ])
  })
})
