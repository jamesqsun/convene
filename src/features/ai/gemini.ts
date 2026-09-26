import { z } from 'zod'
import type { GeminiConfig } from '@/lib/env'
import { type AiProvider, embeddingDimensions } from './provider'

const responseSchema = z.object({
  embeddings: z.array(
    z.object({ values: z.array(z.number().finite()).length(embeddingDimensions) }),
  ),
})

/** Separate requests preserve one vector per memory, in input order. Never fall back mid-batch. */
export function geminiEmbedder(
  config: GeminiConfig,
  fetchImpl: typeof fetch = fetch,
): AiProvider['embed'] {
  return async (texts) => {
    const vectors: number[][] = []
    const model = `models/${config.model}`
    for (let offset = 0; offset < texts.length; offset += 100) {
      const batch = texts.slice(offset, offset + 100)
      const response = await fetchImpl(
        `https://generativelanguage.googleapis.com/v1beta/${model}:batchEmbedContents`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.apiKey },
          signal: AbortSignal.timeout(60_000),
          body: JSON.stringify({
            requests: batch.map((text) => ({
              model,
              content: { parts: [{ text }] },
              outputDimensionality: embeddingDimensions,
              ...(config.model === 'gemini-embedding-001'
                ? { taskType: 'SEMANTIC_SIMILARITY' }
                : {}),
            })),
          }),
        },
      )
      if (!response.ok) throw new Error(`Gemini embeddings failed (HTTP ${response.status})`)
      const parsed = responseSchema.safeParse(await response.json())
      if (!parsed.success || parsed.data.embeddings.length !== batch.length)
        throw new Error(
          'Gemini returned invalid embeddings: expected one 1536-dimensional vector per input',
        )
      for (const { values } of parsed.data.embeddings) {
        const norm = Math.hypot(...values)
        if (!Number.isFinite(norm) || norm === 0)
          throw new Error('Gemini returned a degenerate embedding')
        vectors.push(values.map((value) => value / norm))
      }
    }
    return vectors
  }
}
