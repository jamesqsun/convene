import { type HistorySnapshot, pairBonus } from '../buckets/reconnection'
import type { BucketMember, ProfileSnapshot, UserId } from '../types'
import { similarity } from './similarity'

/**
 * Splits a selected bucket into final groups (technical design section 6).
 *
 * Greedy and deterministic: seed with the smallest user id, then repeatedly add the person who
 * scores highest against the current group, where score blends profile similarity with the same
 * reconnection bonus used for bucket selection. Groups aim for four people; the remainder rule
 * guarantees no singleton and never exceeds five for a final group.
 */

export const targetGroupSize = 4
export const reconnectionWeight = 0.5

/** Size of the next group given how many people are left: 2..5 for the tail, else the target. */
export function groupSize(remaining: number): number {
  return remaining <= targetGroupSize + 1 ? remaining : targetGroupSize
}

function profileOf(
  profiles: ReadonlyMap<UserId, ProfileSnapshot>,
  userId: UserId,
): ProfileSnapshot {
  return profiles.get(userId) ?? { userId, embedding: null, interests: [], memories: [] }
}

export function memberScore(
  candidate: UserId,
  group: readonly UserId[],
  profiles: ReadonlyMap<UserId, ProfileSnapshot>,
  snapshot: HistorySnapshot,
): number {
  if (group.length === 0) return 0
  const candidateProfile = profileOf(profiles, candidate)
  let similaritySum = 0
  let bonusSum = 0
  for (const memberId of group) {
    similaritySum += similarity(candidateProfile, profileOf(profiles, memberId))
    bonusSum += pairBonus(snapshot, candidate, memberId)
  }
  return similaritySum / group.length + reconnectionWeight * (bonusSum / group.length)
}

function pickNext(
  group: readonly BucketMember[],
  pool: readonly BucketMember[],
  profiles: ReadonlyMap<UserId, ProfileSnapshot>,
  snapshot: HistorySnapshot,
): BucketMember {
  const groupIds = group.map((member) => member.userId)
  let best = pool[0]!
  let bestScore = memberScore(best.userId, groupIds, profiles, snapshot)
  for (const candidate of pool.slice(1)) {
    const score = memberScore(candidate.userId, groupIds, profiles, snapshot)
    // Pool is sorted by user id, so a strictly better score is the only way to displace `best`.
    if (score > bestScore) {
      best = candidate
      bestScore = score
    }
  }
  return best
}

export function partitionBucket(
  members: readonly BucketMember[],
  profiles: ReadonlyMap<UserId, ProfileSnapshot>,
  snapshot: HistorySnapshot,
): BucketMember[][] {
  const pool = [...members].sort((a, b) => a.userId.localeCompare(b.userId))
  const groups: BucketMember[][] = []
  while (pool.length > 0) {
    const size = groupSize(pool.length)
    const group = [pool.shift()!]
    while (group.length < size) {
      const next = pickNext(group, pool, profiles, snapshot)
      pool.splice(pool.indexOf(next), 1)
      group.push(next)
    }
    groups.push(group)
  }
  return groups
}
