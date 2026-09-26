import { describe, expect, it } from 'vitest'
import { decryptSecret, encryptSecret } from './secrets'

describe('secrets', () => {
  it('round-trips with a fresh nonce each time', () => {
    const secret = 'passphrase-that-is-long-enough-for-tests'
    const a = encryptSecret('refresh-token', secret)
    const b = encryptSecret('refresh-token', secret)
    expect(a).not.toBe(b)
    expect(decryptSecret(a, secret)).toBe('refresh-token')
    expect(decryptSecret(b, secret)).toBe('refresh-token')
  })

  it('rejects the wrong key, tampering, and unknown formats', () => {
    const encoded = encryptSecret('x', 'key-one-key-one-key-one-key-one-')
    expect(() => decryptSecret(encoded, 'key-two-key-two-key-two-key-two-')).toThrow()
    expect(() =>
      decryptSecret(`${encoded.slice(0, -2)}zz`, 'key-one-key-one-key-one-key-one-'),
    ).toThrow()
    expect(() => decryptSecret('nope', 'key-one-key-one-key-one-key-one-')).toThrow(/format/)
  })
})
