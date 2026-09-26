import { describe, expect, it } from 'vitest'
import { normalizePhone } from './phone'

describe('normalizePhone', () => {
  it('strips separators and keeps E.164', () => {
    expect(normalizePhone('+1 (416) 555-0100')).toBe('+14165550100')
    expect(normalizePhone('+44.20.7123.4567')).toBe('+442071234567')
  })

  it('rejects national formats and junk', () => {
    expect(normalizePhone('416 555 0100')).toBeNull()
    expect(normalizePhone('+0 123 4567')).toBeNull()
    expect(normalizePhone('+1 abc')).toBeNull()
    expect(normalizePhone('+1234567890123456')).toBeNull()
  })
})
