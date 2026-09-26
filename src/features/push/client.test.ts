import { describe, expect, it } from 'vitest'
import { isPushSupported, urlBase64ToUint8Array } from './client'

describe('push client helpers', () => {
  it('decodes url-safe base64 VAPID keys', () => {
    expect(Array.from(urlBase64ToUint8Array('AQID'))).toEqual([1, 2, 3])
    expect(Array.from(urlBase64ToUint8Array('-_8'))).toEqual([251, 255])
  })

  it('reports push as unsupported outside a browser', () => {
    expect(isPushSupported()).toBe(false)
  })
})
