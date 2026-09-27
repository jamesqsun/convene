import type { EmbeddingConfig } from '@/lib/env'
import { geminiEmbedder } from './gemini'
import { openAiEmbedder } from './openai-embeddings'
import type { AiProvider } from './provider'

/** Shared by the app, seed, and rebuild script so all use the same embedding space. */
export function embedderFor(config: EmbeddingConfig): AiProvider['embed'] {
  return config.provider === 'openai' ? openAiEmbedder(config) : geminiEmbedder(config)
}
