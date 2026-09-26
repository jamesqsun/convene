import { describe, expect, it } from 'vitest'
import { day } from '@/lib/time'
import {
  type HistorySnapshot,
  bucketBonus,
  emptySnapshot,
  pairBonus,
  pairKey,
  uniquePairs,
} from './reconnection'

const now = Date.UTC(2026, 9, 1)

function snapshotWith(daysAgo: number, isMutualYes = true, hasHistory = true): HistorySnapshot {
  const reference = now - daysAgo * day
  return {
    scoringTime: now,
    friendships: { [pairKey('a', 'b')]: { createdAt: hasHistory ? now - 400 * day : reference } },
    history: hasHistory
      ? {
          [pairKey('a', 'b')]: {
            latestEventId: 'e1',
            latestEventEnd: reference,
            isMutualYesOnLatest: isMutualYes,
          },
        }
      : {},
  }
}

describe('pairBonus', () => {
  it.each([
    [0, 0],
    [13, 0],
    [14, 0],
    [37, 0.5],
    [60, 1],
    [200, 1],
  ])('after %i days the bonus is %f', (daysAgo, expected) => {
    expect(pairBonus(snapshotWith(daysAgo), 'a', 'b')).toBeCloseTo(expected, 6)
  })

  it('is zero for non-friends and is symmetric', () => {
    expect(pairBonus(snapshotWith(60), 'a', 'c')).toBe(0)
    expect(pairBonus(snapshotWith(60), 'b', 'a')).toBe(1)
  })

  it('is zero without mutual yes on the latest shared event, even for established friends', () => {
    expect(pairBonus(snapshotWith(60, false), 'a', 'b')).toBe(0)
  })

  it('falls back to the friendship creation time only when no shared event exists', () => {
    expect(pairBonus(snapshotWith(60, true, false), 'a', 'b')).toBe(1)
    const invalid: HistorySnapshot = {
      scoringTime: now,
      friendships: { [pairKey('a', 'b')]: { createdAt: null } },
      history: {},
    }
    expect(pairBonus(invalid, 'a', 'b')).toBe(0)
    const nan: HistorySnapshot = {
      scoringTime: now,
      friendships: { [pairKey('a', 'b')]: { createdAt: Number.NaN } },
      history: {},
    }
    expect(pairBonus(nan, 'a', 'b')).toBe(0)
  })

  it('never credits a future reference time', () => {
    expect(pairBonus(snapshotWith(-5), 'a', 'b')).toBe(0)
  })
})

describe('bucketBonus', () => {
  it('sums unique pairs and caps at half the people count', () => {
    const snapshot: HistorySnapshot = { scoringTime: now, friendships: {}, history: {} }
    for (const [x, y] of uniquePairs(['a', 'b', 'c'])) {
      snapshot.friendships[pairKey(x, y)] = { createdAt: now - 100 * day }
    }
    expect(bucketBonus(snapshot, ['a', 'b', 'c'])).toBe(1.5)
    expect(bucketBonus(snapshot, ['a', 'b', 'c', 'd', 'e', 'f'])).toBe(3)
    expect(bucketBonus(emptySnapshot(now), ['a', 'b', 'c'])).toBe(0)
  })

  it('counts each unordered pair once', () => {
    expect(uniquePairs(['a', 'b', 'c'])).toEqual([
      ['a', 'b'],
      ['a', 'c'],
      ['b', 'c'],
    ])
    expect(pairKey('b', 'a')).toBe(pairKey('a', 'b'))
  })
})
