import { describe, expect, it } from 'vitest'
import { slotInputSchema, weekInputSchema } from './schemas'

describe('slotInputSchema', () => {
  it('accepts a date with clock times and rejects anything else', () => {
    expect(
      slotInputSchema.safeParse({ date: '2026-10-03', startTime: '18:00', endTime: '21:30' })
        .success,
    ).toBe(true)
    expect(
      slotInputSchema.safeParse({ date: '2026-10-3', startTime: '18:00', endTime: '21:30' })
        .success,
    ).toBe(false)
    expect(
      slotInputSchema.safeParse({ date: '2026-10-03', startTime: '24:00', endTime: '21:30' })
        .success,
    ).toBe(false)
    for (const removed of [
      { activities: ['coffee'] },
      { budget: 20 },
      { groupSize: 4 },
      { mode: 'online' },
      { radiusKm: 5 },
    ]) {
      expect(
        slotInputSchema.safeParse({
          date: '2026-10-03',
          startTime: '18:00',
          endTime: '21:30',
          ...removed,
        }).success,
      ).toBe(false)
    }
  })
})

describe('weekInputSchema', () => {
  it('accepts day windows including a midnight end and rejects anything else', () => {
    expect(
      weekInputSchema.safeParse({ windows: [{ day: 0, start: '18:00', end: '24:00' }] }).success,
    ).toBe(true)
    expect(
      weekInputSchema.safeParse({ windows: [{ day: 7, start: '18:00', end: '20:00' }] }).success,
    ).toBe(false)
    expect(
      weekInputSchema.safeParse({
        windows: [{ day: 0, start: '18:00', end: '20:00', activity: 'x' }],
      }).success,
    ).toBe(false)
    expect(weekInputSchema.safeParse({ windows: [], repeat: true }).success).toBe(false)
  })
})
