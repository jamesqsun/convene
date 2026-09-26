import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  HttpError,
  bearerToken,
  isSameSecret,
  jsonResponse,
  maxJsonBytes,
  noParams,
  readJson,
  requireSameOrigin,
  route,
  withUser,
  withUserMutation,
} from './http'

const schema = z.object({ name: z.string() }).strict()

function post(body: string, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost:3000/api/test', {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json', host: 'localhost:3000', ...headers },
  })
}

describe('readJson', () => {
  it('parses a valid body', async () => {
    expect(await readJson(post('{"name":"a"}'), schema)).toEqual({ name: 'a' })
  })

  it('rejects unknown fields so removed controls cannot sneak in', async () => {
    await expect(readJson(post('{"name":"a","budget":3}'), schema)).rejects.toMatchObject({
      status: 400,
      code: 'invalid_input',
    })
  })

  it('rejects malformed json', async () => {
    await expect(readJson(post('{oops'), schema)).rejects.toMatchObject({ code: 'invalid_json' })
  })

  it('rejects bodies over the size cap by header and by length', async () => {
    await expect(
      readJson(post('{}', { 'content-length': String(maxJsonBytes + 1) }), schema),
    ).rejects.toMatchObject({
      status: 413,
    })
    const big = JSON.stringify({ name: 'x'.repeat(maxJsonBytes) })
    await expect(readJson(post(big), schema)).rejects.toMatchObject({ status: 413 })
  })
})

describe('requireSameOrigin', () => {
  it('accepts a matching origin', () => {
    expect(() => requireSameOrigin(post('{}', { origin: 'http://localhost:3000' }))).not.toThrow()
  })

  it('rejects a missing or foreign origin', () => {
    expect(() => requireSameOrigin(post('{}'))).toThrow(HttpError)
    expect(() => requireSameOrigin(post('{}', { origin: 'https://evil.example' }))).toThrow(
      /Cross-origin/,
    )
    expect(() => requireSameOrigin(post('{}', { origin: 'not a url' }))).toThrow(HttpError)
  })
})

describe('secrets', () => {
  it('extracts bearer tokens', () => {
    expect(bearerToken(post('{}', { authorization: 'Bearer abc' }))).toBe('abc')
    expect(bearerToken(post('{}'))).toBeNull()
  })

  it('compares secrets without throwing on length mismatch', () => {
    expect(isSameSecret('abc', 'abc')).toBe(true)
    expect(isSameSecret('ab', 'abc')).toBe(false)
    expect(isSameSecret(null, 'abc')).toBe(false)
  })
})

describe('route wrappers', () => {
  it('maps HttpError to a json error response', async () => {
    const handler = route(async () => {
      throw new HttpError(409, 'conflict', 'nope')
    })
    const response = await handler(post('{}'), noParams)
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: { code: 'conflict', message: 'nope' } })
  })

  it('hides unexpected errors behind a 500', async () => {
    const handler = route(async () => {
      throw new Error('secret detail')
    })
    const response = await handler(post('{}'), noParams)
    expect(response.status).toBe(500)
    expect(JSON.stringify(await response.json())).not.toContain('secret detail')
  })

  it('withUser returns 401 without a session and passes the user id otherwise', async () => {
    const anonymous = withUser(
      async () => null,
      async () => jsonResponse({ ok: true }),
    )
    expect((await anonymous(post('{}'), noParams)).status).toBe(401)
    const signedIn = withUser(
      async () => 'user-1',
      async (_request, userId) => jsonResponse({ userId }),
    )
    expect(await (await signedIn(post('{}'), noParams)).json()).toEqual({ userId: 'user-1' })
  })

  it('withUserMutation enforces same origin after authentication', async () => {
    const handler = withUserMutation(
      async () => 'user-1',
      async () => jsonResponse({ ok: true }),
    )
    expect((await handler(post('{}'), noParams)).status).toBe(403)
    expect((await handler(post('{}', { origin: 'http://localhost:3000' }), noParams)).status).toBe(
      200,
    )
  })
})
