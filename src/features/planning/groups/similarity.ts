import { clamp } from '@/lib/time'
import type { ProfileSnapshot } from '../types'

/** Cosine similarity in [-1, 1]; zero when either vector is empty or degenerate. */
export function cosine(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i]! * b[i]!
    normA += a[i]! * a[i]!
    normB += b[i]! * b[i]!
  }
  if (normA === 0 || normB === 0) return 0
  return dot / Math.sqrt(normA * normB)
}

/** Jaccard overlap of interest sets in [0, 1]; zero when neither person lists any. */
export function interestOverlap(a: readonly string[], b: readonly string[]): number {
  const setA = new Set(a.map((interest) => interest.toLowerCase().trim()))
  const setB = new Set(b.map((interest) => interest.toLowerCase().trim()))
  const union = new Set([...setA, ...setB])
  if (union.size === 0) return 0
  let shared = 0
  for (const interest of setA) if (setB.has(interest)) shared += 1
  return shared / union.size
}

/**
 * Profile similarity in [0, 1] (technical design section 6): cosine mapped to the unit interval,
 * falling back to interest overlap for any pair where an embedding is missing.
 */
export function similarity(a: ProfileSnapshot, b: ProfileSnapshot): number {
  if (a.embedding && b.embedding) return clamp((cosine(a.embedding, b.embedding) + 1) / 2, 0, 1)
  return interestOverlap(a.interests, b.interests)
}
