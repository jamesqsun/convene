import { describe, expect, it } from 'vitest'
import type { ProfileSnapshot } from '../types'
import { buildExplanation, sharedInterests } from './explanation'

const profile = (userId: string, interests: string[]): ProfileSnapshot => ({
  userId,
  embedding: null,
  interests,
  memories: [{ topic: 'secret', summary: 'Private detail that must never appear.' }],
})

describe('buildExplanation', () => {
  it('names interests shared by at least two people', () => {
    const text = buildExplanation(
      [
        profile('a', ['coffee', 'hiking']),
        profile('b', ['coffee', 'art']),
        profile('c', ['coffee', 'hiking']),
      ],
      'Walk in the park',
    )
    expect(text).toBe('You share an interest in coffee and hiking, so we picked walk in the park.')
  })

  it('falls back to a generic reason and never leaks memories', () => {
    const text = buildExplanation([profile('a', ['coffee']), profile('b', ['art'])], 'Bowling')
    expect(text).toBe("We matched you on similar tastes, and bowling fits everyone's schedule.")
    expect(text).not.toContain('Private')
  })

  it('caps shared interests at three, most common first', () => {
    const shared = sharedInterests([
      profile('a', ['a', 'b', 'c', 'd']),
      profile('b', ['a', 'b', 'c', 'd']),
      profile('c', ['d']),
    ])
    expect(shared).toEqual(['d', 'a', 'b'])
  })
})
