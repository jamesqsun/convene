import { describe, expect, it } from 'vitest'
import { cookieJarFor, parseCookieHeader, serializeCookie } from './cookies'

describe('cookies', () => {
  it('parses a cookie header', () => {
    expect(parseCookieHeader('a=1; b=hello%20world; malformed')).toEqual([
      { name: 'a', value: '1' },
      { name: 'b', value: 'hello world' },
    ])
    expect(parseCookieHeader(null)).toEqual([])
  })

  it('serializes attributes', () => {
    expect(
      serializeCookie('s', 'v v', { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 60.9 }),
    ).toBe('s=v%20v; Path=/; Max-Age=60; HttpOnly; Secure; SameSite=Lax')
    expect(serializeCookie('s', 'v', { sameSite: true, path: '/x' })).toBe(
      's=v; Path=/x; SameSite=Strict',
    )
  })

  it('reads request cookies and applies pending ones to a response', () => {
    const request = new Request('http://localhost/', { headers: { cookie: 'session=abc' } })
    const jar = cookieJarFor(request)
    expect(jar.getAll()).toEqual([{ name: 'session', value: 'abc' }])
    jar.setAll([{ name: 'session', value: 'def', options: { httpOnly: true } }])
    expect(jar.getAll().at(-1)).toEqual({ name: 'session', value: 'def' })
    const response = jar.applyTo(new Response('ok'))
    expect(response.headers.get('set-cookie')).toBe('session=def; Path=/; HttpOnly')
  })
})
