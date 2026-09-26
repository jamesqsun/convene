import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import type { RankingInput } from '@/features/planning/activities/ranking'
import type { OpenAiConfig } from '@/lib/env'
import { type AiProvider, type MemoryExtractionInput, embeddingDimensions } from './provider'
import {
  type MemoryExtraction,
  memoryExtractionModelSchema,
  memoryExtractionSchema,
  rankingModelSchema,
} from './schemas'

/**
 * OpenAI adapter. Structured outputs via the Responses API for extraction and ranking, the
 * embeddings endpoint for vectors. Extraction results are re-validated with the strict schema;
 * any failure throws so the caller can keep the raw answers and show a notice.
 */

export const memoryExtractionInstructions = `You turn a person's onboarding answers into a small set of preference memories used to plan in-person hangouts.
Rules:
- Produce at most 8 memories, each about one preference, habit, or comfort level relevant to meeting people and choosing activities.
- "evidence" entries must be verbatim substrings copied from the answers. Never paraphrase evidence.
- "attributes" are short lowercase snake_case keys with short string values (for example intensity: "low", group_comfort: "small groups").
- "confidence" is 0 to 1: a single passing mention is low; a clear repeated statement is high.
- Do not infer age, health, religion, politics, ethnicity, sexuality, or anything the person did not state.
- Prefer specific examples over broad labels, and record dislikes and exceptions when stated.`

export const rankingInstructions = `You rank in-person activities for a small group meeting for the first time.
Rules:
- Use only the listed activity ids and only durations from each activity's durationsMinutes that are at most windowMinutes.
- Prefer activities that fit the group's shared interests and memories; favour low-pressure options for strangers.
- Return up to 5 activities, best first. Keep the rationale generic; it is never shown to participants.`

export function openAiProvider(
  config: OpenAiConfig,
  client: OpenAI = new OpenAI({ apiKey: config.apiKey }),
): AiProvider {
  return {
    kind: 'openai',
    async extractMemories(input: MemoryExtractionInput): Promise<MemoryExtraction> {
      const response = await client.responses.parse({
        model: config.model,
        reasoning: { effort: 'low' },
        instructions: memoryExtractionInstructions,
        input: JSON.stringify(input),
        text: { format: zodTextFormat(memoryExtractionModelSchema, 'memory_extraction') },
      })
      const validated = memoryExtractionSchema.safeParse(response.output_parsed)
      if (!validated.success)
        throw new Error(`OpenAI returned an invalid memory extraction: ${validated.error.message}`)
      return validated.data
    },
    async embed(texts) {
      if (texts.length === 0) return []
      const response = await client.embeddings.create({
        model: config.embeddingModel,
        input: [...texts],
        dimensions: embeddingDimensions,
      })
      return response.data.map((item) => item.embedding)
    },
    async rankActivities(input: RankingInput): Promise<unknown> {
      const response = await client.responses.parse({
        model: config.model,
        reasoning: { effort: 'low' },
        instructions: rankingInstructions,
        input: JSON.stringify(input),
        text: { format: zodTextFormat(rankingModelSchema, 'activity_ranking') },
      })
      return response.output_parsed
    },
  }
}
