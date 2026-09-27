import { describe, expect, it } from 'vitest'
import { avatarColorFor, gradientFor, initialOf } from './cardStyle'

describe('cardStyle', () => {
  it('is deterministic for the same key', () => {
    expect(gradientFor('coffee')).toBe(gradientFor('coffee'))
    expect(avatarColorFor('ann')).toBe(avatarColorFor('ann'))
  })

  it('takes the first letter of a name, uppercased', () => {
    expect(initialOf('ben')).toBe('B')
    expect(initialOf('  Zoe')).toBe('Z')
    expect(initialOf('')).toBe('?')
  })
})
