import type { AiProvider } from '@/features/openai/provider'
import type { Db } from '@/lib/db'
import {
  listMemoryEmbeddings,
  listStaleMemories,
  storeMemoryEmbedding,
  storeProfileEmbedding,
} from './store'

/**
 * Keeps derived data consistent with the canonical memories: embeds any memory whose text
 * changed, then recomputes the profile embedding as the normalized mean of memory embeddings.
 * With no memories the profile embedding is cleared and the planner falls back to interests.
 * Called synchronously after every generate, edit, and delete.
 */
export async function refreshDerived(db: Db, ai: AiProvider, userId: string): Promise<void> {
  const stale = await listStaleMemories(db, userId)
  if (stale.length > 0) {
    const embeddings = await ai.embed(stale.map((memory) => memory.text))
    for (const [index, memory] of stale.entries())
      await storeMemoryEmbedding(db, memory.id, embeddings[index]!)
  }
  await storeProfileEmbedding(db, userId, meanUnitVector(await listMemoryEmbeddings(db, userId)))
}

export function meanUnitVector(vectors: readonly (readonly number[])[]): number[] | null {
  const first = vectors[0]
  if (!first) return null
  const sum = new Array<number>(first.length).fill(0)
  for (const vector of vectors) for (let i = 0; i < sum.length; i += 1) sum[i]! += vector[i] ?? 0
  const norm = Math.sqrt(sum.reduce((total, value) => total + value * value, 0))
  return norm === 0 ? sum : sum.map((value) => value / norm)
}
