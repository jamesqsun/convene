import { describe, expect, it } from 'vitest'
import { hour, zonedTime } from '@/lib/time'
import { buildRankingInput, validateRanking } from '@/features/planning/activities/ranking'
import { cosine } from '@/features/planning/groups/similarity'
import { fakeAiProvider, hashedEmbedding } from './fake'
import { embeddingDimensions } from './provider'
import { memoryExtractionSchema } from './schemas'

describe('fakeAiProvider', () => {
  it('builds memories whose evidence is verbatim from the answers', async () => {
    const extraction = await fakeAiProvider().extractMemories({
      interests: ['coffee', 'hiking'],
      answers: [
        {
          prompt: 'What does a good weekend look like?',
          text: 'A long hike, then coffee somewhere quiet. Nothing rushed.',
        },
        { prompt: 'Too short', text: 'meh' },
      ],
    })
    expect(memoryExtractionSchema.safeParse(extraction).success).toBe(true)
    expect(extraction.memories).toHaveLength(1)
    expect(extraction.memories[0]!.topic).toBe('coffee')
    expect(extraction.memories[0]!.evidence).toEqual(['A long hike, then coffee somewhere quiet.'])
  })

  it('embeds deterministically onto the unit sphere with similar texts closer', async () => {
    const [a, b, c] = await fakeAiProvider().embed([
      'coffee and hiking',
      'hiking and coffee',
      'quantum finance',
    ])
    expect(a).toHaveLength(embeddingDimensions)
    expect(hashedEmbedding('coffee and hiking')).toEqual(a)
    expect(cosine(a!, b!)).toBeCloseTo(1, 6)
    expect(cosine(a!, c!)).toBeLessThan(0.5)
    expect(hashedEmbedding('')).toEqual(new Array(embeddingDimensions).fill(0))
  })

  it('ranks activities that the planner accepts', async () => {
    const start = zonedTime('America/Toronto', '2026-10-03', 18)
    const input = buildRankingInput(
      [
        { userId: 'a', embedding: null, interests: ['climbing'], memories: [] },
        { userId: 'b', embedding: null, interests: ['climbing', 'coffee'], memories: [] },
      ],
      { start, end: start + 2 * hour },
      'America/Toronto',
    )
    const raw = await fakeAiProvider().rankActivities(input)
    const ranked = validateRanking(raw, 120)
    expect(ranked[0]).toEqual({ activityId: 'bouldering', durationMinutes: 120 })
    expect(ranked).toHaveLength(3)
  })
})
