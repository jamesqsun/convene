import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

/**
 * AES-256-GCM for secrets at rest (calendar refresh tokens). The key is derived from a
 * configured passphrase; the output is a self-describing string so the format can evolve.
 */

const version = 'v1'

function keyFrom(secret: string): Buffer {
  return createHash('sha256').update(secret).digest()
}

export function encryptSecret(plain: string, secret: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', keyFrom(secret), iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return [
    version,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    data.toString('base64url'),
  ].join('.')
}

export function decryptSecret(encoded: string, secret: string): string {
  const [v, iv, tag, data] = encoded.split('.')
  if (v !== version || !iv || !tag || !data) throw new Error('Unrecognized secret format')
  const decipher = createDecipheriv('aes-256-gcm', keyFrom(secret), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(data, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}
