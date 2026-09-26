import { describe, expect, it } from 'vitest'
import { interests, isInterest, maxInterests } from './interests'

describe('interests', () => {
  it('is a lowercase, duplicate-free vocabulary', () => {
    expect(new Set(interests).size).toBe(interests.length)
    expect(interests.every((interest) => interest === interest.toLowerCase().trim())).toBe(true)
    expect(interests.length).toBeGreaterThan(maxInterests)
  })

  it('recognizes members and rejects strangers', () => {
    expect(isInterest('coffee')).toBe(true)
    expect(isInterest('Coffee')).toBe(false)
    expect(isInterest('skydiving')).toBe(false)
  })
})
