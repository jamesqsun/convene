import { describe, expect, it } from 'vitest'
import { configuredTokenSecret } from './config'

describe('configuredTokenSecret', () => {
  it('is stable within a demo process', () => {
    expect(configuredTokenSecret()).toBe(configuredTokenSecret())
    expect(configuredTokenSecret().length).toBeGreaterThanOrEqual(32)
  })
})
