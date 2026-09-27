import { describe, expect, it, vi } from 'vitest'
import { embedderFor } from './embeddings'

describe('embedderFor', () => {
  it.each(['gemini', 'openai'] as const)(
    'routes %s exclusively to its own endpoint',
    async (provider) => {
      const vector = [1, ...Array<number>(1535).fill(0)]
      const request = vi.fn(async () =>
        Response.json(
          provider === 'openai'
            ? { data: [{ index: 0, embedding: vector }] }
            : { embeddings: [{ values: vector }] },
        ),
      )
      vi.stubGlobal('fetch', request)
      try {
        const config =
          provider === 'openai'
            ? { provider, apiKey: 'selected-key', model: 'text-embedding-3-small' as const }
            : { provider, apiKey: 'selected-key', model: 'gemini-embedding-2' as const }
        expect(await embedderFor(config)(['memory'])).toEqual([vector])
        const [input, init] = request.mock.calls[0] as unknown as [RequestInfo, RequestInit]
        const sent = new Request(input, init)
        expect(new URL(sent.url).hostname).toBe(
          provider === 'openai' ? 'api.openai.com' : 'generativelanguage.googleapis.com',
        )
        expect(sent.headers.get(provider === 'openai' ? 'authorization' : 'x-goog-api-key')).toBe(
          provider === 'openai' ? 'Bearer selected-key' : 'selected-key',
        )
        expect(request).toHaveBeenCalledTimes(1)
      } finally {
        vi.unstubAllGlobals()
      }
    },
  )
})
