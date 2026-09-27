import OpenAI from 'openai'
import { z } from 'zod'
import type { OpenAiEmbeddingConfig } from '@/lib/env'
import { type AiProvider, embeddingDimensions } from './provider'

const responseSchema = z.object({
  data: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      embedding: z.array(z.number().finite()).length(embeddingDimensions),
    }),
  ),
})

/** Only the embeddings endpoint is used; text generation remains with Meta. */
export function openAiEmbedder(
  config: OpenAiEmbeddingConfig,
  client: Pick<OpenAI, 'embeddings'> = new OpenAI({
    apiKey: config.apiKey,
    baseURL: 'https://api.openai.com/v1',
    timeout: 60_000,
    maxRetries: 2,
  }),
): AiProvider['embed'] {
  return async (texts) => {
    const vectors: number[][] = []
    for (let offset = 0; offset < texts.length; offset += 100) {
      const batch = texts.slice(offset, offset + 100)
      const response = await client.embeddings.create({
        model: config.model,
        input: [...batch],
        dimensions: embeddingDimensions,
        encoding_format: 'float',
      })
      const parsed = responseSchema.safeParse(response)
      if (!parsed.success || parsed.data.data.length !== batch.length)
        throw new Error(
          'OpenAI returned invalid embeddings: expected one 1536-dimensional vector per input',
        )
      const ordered = parsed.data.data.sort((a, b) => a.index - b.index)
      for (const [index, item] of ordered.entries()) {
        if (item.index !== index) throw new Error('OpenAI returned invalid embedding indices')
        const norm = Math.hypot(...item.embedding)
        if (!Number.isFinite(norm) || norm === 0)
          throw new Error('OpenAI returned a degenerate embedding')
        vectors.push(item.embedding.map((value) => value / norm))
      }
    }
    return vectors
  }
}
