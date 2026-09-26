import { describe, expect, it } from 'vitest'
import type { BucketMember } from '../types'
import { planningIdFor } from './planning-id'

const member = (userId: string, revision = 1): BucketMember => ({
  userId,
  slotId: `slot-${userId}`,
  revision,
  segmentStart: 0,
  segmentEnd: 1,
})

describe('planningIdFor', () => {
  it('is stable across member order and distinct across inputs', () => {
    const a = planningIdFor('batch', 1, [member('x'), member('y')])
    expect(planningIdFor('batch', 1, [member('y'), member('x')])).toBe(a)
    expect(planningIdFor('batch', 2, [member('x'), member('y')])).not.toBe(a)
    expect(planningIdFor('other', 1, [member('x'), member('y')])).not.toBe(a)
    expect(planningIdFor('batch', 1, [member('x', 2), member('y')])).not.toBe(a)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })
})
