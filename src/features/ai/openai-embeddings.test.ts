import type OpenAI from 'openai'
import { describe, expect, it, vi } from 'vitest'
import { openAiEmbedder } from './openai-embeddings'

const config = { apiKey: 'openai-key', model: 'text-embedding-3-small' } as const
const vector = (a = 3, b = 4) => [a, b, ...Array<number>(1534).fill(0)]
function stub(data: unknown[]) {
  const create = vi.fn(async () => ({ data }))
  return { create, client: { embeddings: { create } } as unknown as Pick<OpenAI, 'embeddings'> }
}

describe('openAiEmbedder', () => {
  it('requests 1536 floats, restores input order, and normalizes', async () => {
    const { client, create } = stub([
      { index: 1, embedding: vector(4, 3) },
      { index: 0, embedding: vector() },
    ])
    const embed = openAiEmbedder(config, client)
    expect(await embed([])).toEqual([])
    expect(create).not.toHaveBeenCalled()
    const result = await embed(['coffee', 'hiking'])
    expect(result.map((v) => v.slice(0, 2))).toEqual([
      [0.6, 0.8],
      [0.8, 0.6],
    ])
    expect(create).toHaveBeenCalledWith({
      model: 'text-embedding-3-small',
      input: ['coffee', 'hiking'],
      dimensions: 1536,
      encoding_format: 'float',
    })
  })

  it.each(
    [
      [],
      [{ index: 0, embedding: [1] }],
      [{ index: 1, embedding: vector() }],
      [{ index: 0, embedding: vector(0, 0) }],
      [{ index: 0, embedding: [NaN, ...vector().slice(1)] }],
    ].map((data) => ({ data })),
  )('rejects malformed results without falling back', async ({ data }) => {
    const { client } = stub(data)
    await expect(openAiEmbedder(config, client)(['text'])).rejects.toThrow(/OpenAI/)
  })

  it('chunks large batches and propagates failures', async () => {
    const create = vi.fn(async ({ input }: { input: string[] }) => ({
      data: input.map((_, index) => ({ index, embedding: vector() })),
    }))
    const client = { embeddings: { create } } as unknown as Pick<OpenAI, 'embeddings'>
    expect(await openAiEmbedder(config, client)(Array(101).fill('text'))).toHaveLength(101)
    expect(create.mock.calls.map(([p]) => p.input.length)).toEqual([100, 1])
    create.mockRejectedValueOnce(new Error('quota'))
    await expect(openAiEmbedder(config, client)(['text'])).rejects.toThrow('quota')
  })
})
