import type { RankingInput } from '@/features/planning/activities/ranking'
import { type AiProvider, type MemoryExtractionInput, embeddingDimensions } from './provider'
import type { MemoryDraft, MemoryExtraction } from './schemas'

/**
 * Deterministic stand-in for OpenAI used in demo mode, tests, and when no key is configured.
 * Memories are built from the answer text itself so evidence is always verbatim; embeddings are a
 * hashed bag of words on the unit sphere, so similar answers land near each other.
 */
export function fakeAiProvider(): AiProvider {
  return {
    kind: 'fake',
    async extractMemories(input) {
      return fakeMemories(input)
    },
    async embed(texts) {
      return texts.map(hashedEmbedding)
    },
    async rankActivities(input) {
      return fakeRanking(input)
    },
  }
}

function firstSentence(text: string): string {
  const match = /^[^.!?\n]+[.!?]?/.exec(text.trim())
  return (match?.[0] ?? text).trim().slice(0, 300)
}

function mentionedInterests(text: string, interests: readonly string[]): string[] {
  const lower = text.toLowerCase()
  return interests.filter((interest) => lower.includes(interest.toLowerCase()))
}

export function fakeMemories(input: MemoryExtractionInput): MemoryExtraction {
  const memories: MemoryDraft[] = []
  for (const answer of input.answers) {
    if (answer.text.trim().length < 20) continue
    const mentioned = mentionedInterests(answer.text, input.interests)
    const sentence = firstSentence(answer.text)
    memories.push({
      topic: mentioned[0] ?? answer.prompt.toLowerCase().slice(0, 80),
      summary: sentence.slice(0, 200),
      evidence: [sentence],
      attributes: [
        { key: 'prompt', value: answer.prompt.slice(0, 200) },
        ...(mentioned.length > 0
          ? [{ key: 'mentions', value: mentioned.join(', ').slice(0, 200) }]
          : []),
      ],
      confidence: 0.6,
    })
  }
  return { memories: memories.slice(0, 8) }
}

/** FNV-1a 32-bit hash; small, fast, and stable across runs. */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}

export function hashedEmbedding(text: string): number[] {
  const vector = new Array<number>(embeddingDimensions).fill(0)
  const tokens = text.toLowerCase().match(/[a-z0-9]+/g) ?? []
  for (const token of tokens) {
    const hash = fnv1a(token)
    const index = hash % embeddingDimensions
    vector[index]! += hash & 0x80000000 ? -1 : 1
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))
  return norm === 0 ? vector : vector.map((value) => value / norm)
}

export function fakeRanking(input: RankingInput): {
  ranked: { activityId: string; durationMinutes: number }[]
  rationale: string
} {
  const ranked = input.activities
    .map((activity) => {
      const tags = new Set(activity.tags)
      const matches = input.participants.filter((p) =>
        p.interests.some((interest) => tags.has(interest)),
      ).length
      const fitting = activity.durationsMinutes.filter(
        (duration) => duration <= input.windowMinutes,
      )
      return { activity, matches, duration: fitting.length > 0 ? Math.max(...fitting) : null }
    })
    .filter((entry): entry is typeof entry & { duration: number } => entry.duration !== null)
    .sort((a, b) => b.matches - a.matches || a.activity.id.localeCompare(b.activity.id))
    .slice(0, 3)
    .map((entry) => ({ activityId: entry.activity.id, durationMinutes: entry.duration }))
  return { ranked, rationale: 'Fictional ranking from shared public interests.' }
}
