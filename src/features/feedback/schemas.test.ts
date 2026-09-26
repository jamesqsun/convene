import { describe, expect, it } from 'vitest'
import { feedbackInputSchema } from './schemas'

const valid = {
  eventId: '11111111-1111-4111-8111-111111111111',
  subjectUserId: '22222222-2222-4222-8222-222222222222',
  answer: 'yes',
}

describe('feedbackInputSchema', () => {
  it('accepts yes/no per person and nothing else', () => {
    expect(feedbackInputSchema.safeParse(valid).success).toBe(true)
    expect(feedbackInputSchema.safeParse({ ...valid, answer: 'maybe' }).success).toBe(false)
    expect(feedbackInputSchema.safeParse({ ...valid, rating: 5 }).success).toBe(false)
    expect(feedbackInputSchema.safeParse({ ...valid, comment: 'nice' }).success).toBe(false)
    expect(feedbackInputSchema.safeParse({ ...valid, eventId: 'x' }).success).toBe(false)
  })
})
