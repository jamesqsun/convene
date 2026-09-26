import { describe, expect, it, vi } from 'vitest'
import { geminiEmbedder } from './gemini'

const config = { apiKey: 'gemini-test', model: 'gemini-embedding-2' } as const
const vector = (a = 3, b = 4) => [a, b, ...Array<number>(1534).fill(0)]

describe('geminiEmbedder', () => {
  it('sends separate inputs to Google, preserves order, and normalizes vectors', async () => {
    const request = vi.fn(async () =>
      Response.json({ embeddings: [{ values: vector() }, { values: vector(4, 3) }] }),
    )
    const embed = geminiEmbedder(config, request)
    expect(await embed([])).toEqual([])
    expect(request).not.toHaveBeenCalled()
    const result = await embed(['coffee', 'hiking'])
    expect(result[0]!.slice(0, 2)).toEqual([0.6, 0.8])
    expect(result[1]!.slice(0, 2)).toEqual([0.8, 0.6])
    const [url, options] = (request.mock.calls as unknown as [string, RequestInit][])[0]!
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:batchEmbedContents',
    )
    expect(options.headers).toMatchObject({ 'x-goog-api-key': 'gemini-test' })
    const body = JSON.parse(options.body as string)
    expect(body.requests).toEqual(
      ['coffee', 'hiking'].map((text) => ({
        model: 'models/gemini-embedding-2',
        content: { parts: [{ text }] },
        outputDimensionality: 1536,
      })),
    )
  })

  it('chunks batches and sets the task type only for Embedding 001', async () => {
    const request = vi.fn(async (_url: unknown, options?: RequestInit) => {
      const body = JSON.parse(options!.body as string)
      expect(body.requests.length).toBeLessThanOrEqual(100)
      expect(body.requests[0].taskType).toBe('SEMANTIC_SIMILARITY')
      return Response.json({ embeddings: body.requests.map(() => ({ values: vector() })) })
    })
    expect(
      await geminiEmbedder(
        { ...config, model: 'gemini-embedding-001' },
        request,
      )(Array(101).fill('text')),
    ).toHaveLength(101)
    expect(request).toHaveBeenCalledTimes(2)
  })

  it.each([
    { embeddings: [] },
    { embeddings: [{ values: [1, 2] }] },
    { embeddings: [{ values: vector(0, 0) }] },
    { embeddings: [{ values: ['invalid', ...vector().slice(1)] }] },
  ])('rejects invalid vectors instead of silently substituting another model', async (body) => {
    await expect(geminiEmbedder(config, async () => Response.json(body))(['text'])).rejects.toThrow(
      /Gemini/,
    )
  })

  it('surfaces HTTP failure without leaking the provider response or key', async () => {
    await expect(
      geminiEmbedder(config, async () => new Response('secret', { status: 429 }))(['text']),
    ).rejects.toThrow('Gemini embeddings failed (HTTP 429)')
  })
})
