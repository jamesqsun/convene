import { describe, expect, it, vi } from 'vitest'
import { ApiError, apiFetch } from './client-api'

function fetchReturning(status: number, body: string | null) {
  return vi.fn(async () => new Response(body, { status }))
}

describe('apiFetch', () => {
  it('sends JSON with cookies and parses the result', async () => {
    const fetchImpl = fetchReturning(200, '{"ok":true}')
    expect(
      await apiFetch('/api/x', { method: 'POST', body: { a: 1 } }, fetchImpl as never),
    ).toEqual({ ok: true })
    const [, init] = fetchImpl.mock.calls[0]! as unknown as [string, RequestInit]
    expect(init.credentials).toBe('same-origin')
    expect(init.body).toBe('{"a":1}')
  })

  it('returns undefined for 204 and throws a typed error otherwise', async () => {
    expect(await apiFetch('/api/x', {}, fetchReturning(204, null) as never)).toBeUndefined()
    await expect(
      apiFetch(
        '/api/x',
        {},
        fetchReturning(409, '{"error":{"code":"overlap","message":"nope"}}') as never,
      ),
    ).rejects.toMatchObject({
      status: 409,
      code: 'overlap',
      message: 'nope',
    })
    await expect(
      apiFetch('/api/x', {}, fetchReturning(500, 'not json') as never),
    ).rejects.toBeInstanceOf(ApiError)
  })
})
