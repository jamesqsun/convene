import { describe, expect, it } from 'vitest'
import { day } from '@/lib/time'
import { emptySnapshot, pairKey } from '../buckets/reconnection'
import type { BucketMember, ProfileSnapshot, UserId } from '../types'
import { groupSize, memberScore, partitionBucket } from './partition'

const now = Date.UTC(2026, 9, 1)
const member = (userId: string): BucketMember => ({
  userId,
  slotId: `slot-${userId}`,
  revision: 1,
  segmentStart: 0,
  segmentEnd: 1,
})
const members = (n: number) =>
  Array.from({ length: n }, (_, i) => member(String.fromCharCode(65 + i)))
const profiles = (entries: Record<string, number[]>): Map<UserId, ProfileSnapshot> =>
  new Map(
    Object.entries(entries).map(([userId, embedding]) => [
      userId,
      { userId, embedding, interests: [], memories: [] },
    ]),
  )
const none = emptySnapshot(now)
const ids = (groups: BucketMember[][]) => groups.map((group) => group.map((m) => m.userId).join(''))

describe('groupSize', () => {
  it.each([
    [2, 2],
    [3, 3],
    [4, 4],
    [5, 5],
    [6, 4],
    [9, 4],
  ])('with %i remaining makes a group of %i', (remaining, expected) => {
    expect(groupSize(remaining)).toBe(expected)
  })
})

describe('partitionBucket', () => {
  it.each([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13])(
    'partitions %i people into groups of 2 to 5 with everyone exactly once',
    (n) => {
      const groups = partitionBucket(members(n), new Map(), none)
      const sizes = groups.map((group) => group.length)
      expect(sizes.every((size) => size >= 2 && size <= 5)).toBe(true)
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(n)
      expect(new Set(groups.flat().map((m) => m.userId)).size).toBe(n)
    },
  )

  it('produces the documented remainder shapes', () => {
    expect(partitionBucket(members(6), new Map(), none).map((g) => g.length)).toEqual([4, 2])
    expect(partitionBucket(members(9), new Map(), none).map((g) => g.length)).toEqual([4, 5])
  })

  it('groups similar people together', () => {
    const embeddings = profiles({
      A: [1, 0],
      B: [0, 1],
      C: [1, 0.1],
      D: [0.1, 1],
      E: [1, 0],
      F: [0, 1],
    })
    expect(ids(partitionBucket(members(6), embeddings, none))).toEqual(['AECD', 'BF'])
  })

  it('pulls overdue friends into the seed group without forcing a whole chain together', () => {
    const snapshot = emptySnapshot(now)
    for (const [a, b] of [
      ['A', 'F'],
      ['F', 'E'],
      ['E', 'D'],
      ['D', 'C'],
      ['C', 'B'],
    ]) {
      snapshot.friendships[pairKey(a!, b!)] = { createdAt: now - 100 * day }
    }
    const groups = partitionBucket(members(6), new Map(), snapshot)
    expect(groups.map((g) => g.length)).toEqual([4, 2])
    expect(groups[0]!.map((m) => m.userId)).toContain('F')
  })

  it('is deterministic with stable tie-breaking by user id', () => {
    const first = partitionBucket(members(7), new Map(), none)
    const second = partitionBucket([...members(7)].reverse(), new Map(), none)
    expect(ids(first)).toEqual(ids(second))
    expect(ids(first)).toEqual(['ABCD', 'EFG'])
  })
})

describe('memberScore', () => {
  it('blends mean similarity with half the mean pair bonus', () => {
    const snapshot = emptySnapshot(now)
    snapshot.friendships[pairKey('A', 'B')] = { createdAt: now - 100 * day }
    const embeddings = profiles({ A: [1, 0], B: [1, 0], C: [0, 1] })
    expect(memberScore('A', ['B', 'C'], embeddings, snapshot)).toBeCloseTo(
      (1 + 0.5) / 2 + 0.5 * (1 / 2),
    )
    expect(memberScore('A', [], embeddings, snapshot)).toBe(0)
  })
})
