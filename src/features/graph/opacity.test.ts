import { describe, expect, it } from 'vitest'
import { day } from '@/lib/time'
import { edgeOpacity, minimumOpacity } from './opacity'

describe('edgeOpacity', () => {
  it('starts bright and fades to a floor', () => {
    const now = Date.UTC(2026, 9, 1)
    expect(edgeOpacity(now, now)).toBe(1)
    expect(edgeOpacity(now - 30 * day, now)).toBeCloseTo(2 / 3)
    expect(edgeOpacity(now - 90 * day, now)).toBe(minimumOpacity)
    expect(edgeOpacity(now - 400 * day, now)).toBe(minimumOpacity)
    expect(edgeOpacity(now + day, now)).toBe(1)
  })
})
