import { describe, expect, it } from 'vitest'
import { subscriptionInputSchema, unsubscribeInputSchema } from './schemas'

describe('push schemas', () => {
  it('accepts a browser subscription shape and rejects extras', () => {
    const valid = {
      endpoint: 'https://push.example/abc',
      keys: { p256dh: 'k', auth: 'a' },
      expirationTime: null,
    }
    expect(subscriptionInputSchema.safeParse(valid).success).toBe(true)
    expect(subscriptionInputSchema.safeParse({ ...valid, userId: 'x' }).success).toBe(false)
    expect(subscriptionInputSchema.safeParse({ ...valid, endpoint: 'not a url' }).success).toBe(
      false,
    )
    expect(unsubscribeInputSchema.safeParse({ endpoint: 'https://push.example/abc' }).success).toBe(
      true,
    )
  })
})
