import { describe, expect, it } from 'vitest'
import { memoryPatchSchema } from './schemas'

describe('memoryPatchSchema', () => {
  it('accepts field edits and rejects empty, unknown, or influence-style fields', () => {
    expect(memoryPatchSchema.safeParse({ topic: 'Coffee' }).success).toBe(true)
    expect(
      memoryPatchSchema.safeParse({
        attributes: { intensity: 'low', group_comfort: 'small groups' },
      }).success,
    ).toBe(true)
    expect(memoryPatchSchema.safeParse({}).success).toBe(false)
    expect(memoryPatchSchema.safeParse({ weight: 0.5 }).success).toBe(false)
    expect(memoryPatchSchema.safeParse({ useLess: true }).success).toBe(false)
    expect(memoryPatchSchema.safeParse({ evidence: ['x'] }).success).toBe(false)
    expect(memoryPatchSchema.safeParse({ attributes: { 'Bad Key': 'x' } }).success).toBe(false)
    expect(memoryPatchSchema.safeParse({ attributes: { a: '' } }).success).toBe(false)
  })
})
