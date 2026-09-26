import { describe, expect, it } from 'vitest'
import type { ProfileSnapshot } from '../types'
import { cosine, interestOverlap, similarity } from './similarity'

const profile = (
  userId: string,
  embedding: number[] | null,
  interests: string[] = [],
): ProfileSnapshot => ({
  userId,
  embedding,
  interests,
  memories: [],
})

describe('cosine', () => {
  it('maps identical, orthogonal, and opposite vectors', () => {
    expect(cosine([1, 0], [1, 0])).toBe(1)
    expect(cosine([1, 0], [0, 1])).toBe(0)
    expect(cosine([1, 0], [-1, 0])).toBe(-1)
  })

  it('is zero for empty, mismatched, or zero vectors', () => {
    expect(cosine([], [])).toBe(0)
    expect(cosine([1], [1, 2])).toBe(0)
    expect(cosine([0, 0], [1, 1])).toBe(0)
  })
})

describe('interestOverlap', () => {
  it('is Jaccard over normalized interests', () => {
    expect(interestOverlap(['Coffee', 'hiking'], ['coffee', 'art'])).toBeCloseTo(1 / 3)
    expect(interestOverlap([], [])).toBe(0)
    expect(interestOverlap(['a'], [])).toBe(0)
  })
})

describe('similarity', () => {
  it('uses embeddings when both exist and clamps the mapped cosine', () => {
    expect(similarity(profile('a', [1, 0]), profile('b', [1, 0]))).toBe(1)
    expect(similarity(profile('a', [1, 0]), profile('b', [-1, 0]))).toBe(0)
    expect(similarity(profile('a', [1, 0]), profile('b', [0, 1]))).toBe(0.5)
  })

  it('falls back to interests when either embedding is missing', () => {
    expect(similarity(profile('a', null, ['coffee']), profile('b', [1, 0], ['coffee']))).toBe(1)
    expect(similarity(profile('a', null), profile('b', null))).toBe(0)
  })
})
