import { clamp, day } from '@/lib/time'
import type { PairKey, UserId } from '../types'

/**
 * Reconnection bonus (technical design section 5).
 *
 * Only feedback-established friendships count, and only while both people answered yes about each
 * other for their latest completed shared hangout. The bonus is zero for the first 14 days after
 * that hangout, then ramps linearly to 1 at 60 days. A bucket's total is capped at half its size.
 */

export const bonusRampStartDays = 14
export const bonusRampEndDays = 60
export const bucketBonusCapRatio = 0.5

export interface PairHistory {
  latestEventId: string | null
  latestEventEnd: number | null
  isMutualYesOnLatest: boolean
}

/** Everything the scoring stage knows about relationships, frozen for one planning pass. */
export interface HistorySnapshot {
  scoringTime: number
  friendships: Record<PairKey, { createdAt: number | null }>
  history: Record<PairKey, PairHistory>
}

export function emptySnapshot(scoringTime: number): HistorySnapshot {
  return { scoringTime, friendships: {}, history: {} }
}

export function pairKey(a: UserId, b: UserId): PairKey {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

export function uniquePairs(userIds: readonly UserId[]): [UserId, UserId][] {
  const pairs: [UserId, UserId][] = []
  for (let i = 0; i < userIds.length; i += 1) {
    for (let j = i + 1; j < userIds.length; j += 1) pairs.push([userIds[i]!, userIds[j]!])
  }
  return pairs
}

function referenceTime(snapshot: HistorySnapshot, key: PairKey): number | null {
  const friendship = snapshot.friendships[key]
  if (!friendship) return null
  const history = snapshot.history[key]
  if (history) {
    // A completed shared hangout without mutual yes disables the bonus, even for old friends.
    return history.isMutualYesOnLatest ? history.latestEventEnd : null
  }
  // No completed shared event on record: legacy gap, fall back to when the friendship formed.
  return friendship.createdAt
}

export function pairBonus(snapshot: HistorySnapshot, a: UserId, b: UserId): number {
  const reference = referenceTime(snapshot, pairKey(a, b))
  if (reference === null || !Number.isFinite(reference)) return 0
  const daysSince = Math.max(0, (snapshot.scoringTime - reference) / day)
  return clamp((daysSince - bonusRampStartDays) / (bonusRampEndDays - bonusRampStartDays), 0, 1)
}

/** Sum of pair bonuses, capped at half the number of people. */
export function bucketBonus(snapshot: HistorySnapshot, userIds: readonly UserId[]): number {
  const total = uniquePairs(userIds).reduce((sum, [a, b]) => sum + pairBonus(snapshot, a, b), 0)
  return Math.min(total, bucketBonusCapRatio * userIds.length)
}
