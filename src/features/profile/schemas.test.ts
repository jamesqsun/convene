import { describe, expect, it } from 'vitest'
import { onboardingPrompts, profilePatchSchema } from './schemas'

describe('profilePatchSchema', () => {
  it('accepts a partial patch', () => {
    expect(profilePatchSchema.safeParse({ name: ' Maya ', age: 29 }).success).toBe(true)
    expect(profilePatchSchema.parse({ name: ' Maya ' }).name).toBe('Maya')
  })

  it('rejects removed controls, unknown interests, duplicates, and short answers', () => {
    for (const removed of [
      { budget: 20 },
      { activities: ['coffee'] },
      { groupSize: 4 },
      { platform: 'discord' },
      { meetingMode: 'online' },
      { travelRadiusKm: 5 },
      { connectionCategory: 'friends' },
    ]) {
      expect(profilePatchSchema.safeParse(removed).success).toBe(false)
    }
    expect(profilePatchSchema.safeParse({ interests: ['skydiving'] }).success).toBe(false)
    expect(profilePatchSchema.safeParse({ interests: ['coffee', 'coffee'] }).success).toBe(false)
    expect(profilePatchSchema.safeParse({ age: 17 }).success).toBe(false)
    expect(
      profilePatchSchema.safeParse({
        answers: [{ promptId: onboardingPrompts[0].id, text: 'too short' }],
      }).success,
    ).toBe(false)
    expect(
      profilePatchSchema.safeParse({ answers: [{ promptId: 'unknown', text: 'x'.repeat(30) }] })
        .success,
    ).toBe(false)
    const duplicate = {
      answers: [
        { promptId: 'weekend', text: 'x'.repeat(30) },
        { promptId: 'weekend', text: 'y'.repeat(30) },
      ],
    }
    expect(profilePatchSchema.safeParse(duplicate).success).toBe(false)
  })
})
