import type OpenAI from 'openai'
import { describe, expect, it, vi } from 'vitest'
import { metaAiProvider } from './real'

const config = { apiKey: 'sk-test', model: 'muse-spark-1.3' }

function stubClient(parsed: unknown) {
  const parse = vi.fn(async (_params: Record<string, unknown>) => ({ output_parsed: parsed }))
  const client = { responses: { parse } } as unknown as OpenAI
  return { client, parse }
}

describe('metaAiProvider', () => {
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
    const provider = metaAiProvider(config, async () => [], client)
    const result = await provider.extractMemories({
      interests: ['coffee'],
      answers: [{ prompt: 'p', text: 'I love cafes' }],
    })
    expect(result).toEqual(valid)
    const params = parse.mock.calls[0]![0]
    expect(params.model).toBe('muse-spark-1.3')
    expect(params.reasoning).toEqual({ effort: 'low' })
    expect(params.store).toBe(false)
    expect((params.text as { format: { name: string } }).format.name).toBe('memory_extraction')
  })

  it('rejects extraction output that fails the strict schema', async () => {
    const { client } = stubClient({
      memories: [{ topic: '', summary: 'x', evidence: [], attributes: [], confidence: 2 }],
    })
    await expect(
      metaAiProvider(config, async () => [], client).extractMemories({
        interests: [],
        answers: [],
      }),
    ).rejects.toThrow(/invalid memory extraction/)
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
    expect(await metaAiProvider(config, async () => [], client).rankActivities(input)).toEqual(raw)
  })

  it('routes actual SDK requests to Meta and delegates embeddings to Gemini', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        id: 'resp_test',
        object: 'response',
        status: 'completed',
        output: [
          {
            type: 'message',
            id: 'msg_test',
            role: 'assistant',
            status: 'completed',
            content: [{ type: 'output_text', text: '{"memories":[]}', annotations: [] }],
          },
        ],
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    try {
      const embed = vi.fn(async () => [[0.5]])
      const provider = metaAiProvider(config, embed)
      expect(await provider.extractMemories({ interests: [], answers: [] })).toEqual({
        memories: [],
      })
      const [input, init] = fetchMock.mock.calls[0] as unknown as [RequestInfo, RequestInit]
      const request = new Request(input, init)
      expect(request.url).toBe('https://api.meta.ai/v1/responses')
      expect(request.headers.get('authorization')).toBe('Bearer sk-test')
      expect(await provider.embed(['memory'])).toEqual([[0.5]])
      expect(embed).toHaveBeenCalledWith(['memory'])
      expect(fetchMock).toHaveBeenCalledTimes(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
