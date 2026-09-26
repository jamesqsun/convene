import type OpenAI from 'openai'
import { describe, expect, it, vi } from 'vitest'
import { openAiProvider } from './real'

const config = { apiKey: 'sk-test', model: 'gpt-6-luna', embeddingModel: 'text-embedding-3-small' }

function stubClient(parsed: unknown) {
  const parse = vi.fn(async (_params: Record<string, unknown>) => ({ output_parsed: parsed }))
  const create = vi.fn(async ({ input }: { input: string[] }) => ({
    data: input.map(() => ({ embedding: [0.1, 0.2] })),
  }))
  const client = { responses: { parse }, embeddings: { create } } as unknown as OpenAI
  return { client, parse, create }
}

describe('openAiProvider', () => {
  it('requests structured memory extraction with low reasoning effort and re-validates the result', async () => {
    const valid = {
      memories: [
        {
          topic: 'coffee',
          summary: 'Likes cafes.',
          evidence: ['I love cafes'],
          attributes: [{ key: 'setting', value: 'quiet' }],
          confidence: 0.7,
        },
      ],
    }
    const { client, parse } = stubClient(valid)
    const provider = openAiProvider(config, client)
    const result = await provider.extractMemories({
      interests: ['coffee'],
      answers: [{ prompt: 'p', text: 'I love cafes' }],
    })
    expect(result).toEqual(valid)
    const params = parse.mock.calls[0]![0]
    expect(params.model).toBe('gpt-6-luna')
    expect(params.reasoning).toEqual({ effort: 'low' })
    expect((params.text as { format: { name: string } }).format.name).toBe('memory_extraction')
  })

  it('rejects extraction output that fails the strict schema', async () => {
    const { client } = stubClient({
      memories: [{ topic: '', summary: 'x', evidence: [], attributes: [], confidence: 2 }],
    })
    await expect(
      openAiProvider(config, client).extractMemories({ interests: [], answers: [] }),
    ).rejects.toThrow(/invalid memory extraction/)
  })

  it('requests 1536-dimensional embeddings and skips empty input', async () => {
    const { client, create } = stubClient(null)
    const provider = openAiProvider(config, client)
    expect(await provider.embed(['a', 'b'])).toEqual([
      [0.1, 0.2],
      [0.1, 0.2],
    ])
    expect(create.mock.calls[0]![0]).toMatchObject({
      model: 'text-embedding-3-small',
      dimensions: 1536,
    })
    expect(await provider.embed([])).toEqual([])
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('returns raw ranking output for the planner to validate', async () => {
    const raw = { ranked: [{ activityId: 'coffee', durationMinutes: 60 }], rationale: 'r' }
    const { client } = stubClient(raw)
    const input = {
      groupSize: 2,
      windowMinutes: 120,
      weekday: 'Saturday',
      localStart: '18:00',
      participants: [],
      activities: [],
    }
    expect(await openAiProvider(config, client).rankActivities(input)).toEqual(raw)
  })
})
