import type { RankingInput } from '@/features/planning/activities/ranking'
import type { MemoryExtraction } from './schemas'

export interface OnboardingAnswer {
  prompt: string
  text: string
}

export interface MemoryExtractionInput {
  interests: string[]
  answers: OnboardingAnswer[]
}

/**
 * The AI surface Convene needs: memory extraction from onboarding answers, embeddings, and
 * activity ranking. `rankActivities` returns the raw parsed output because the planner validates
 * it against the catalog and window itself.
 */
export interface AiProvider {
  readonly kind: 'openai' | 'fake'
  extractMemories(input: MemoryExtractionInput): Promise<MemoryExtraction>
  embed(texts: readonly string[]): Promise<number[][]>
  rankActivities(input: RankingInput): Promise<unknown>
}

export const embeddingDimensions = 1536
