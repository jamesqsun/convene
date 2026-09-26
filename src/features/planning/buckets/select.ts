import type { Candidate, ScoredCandidate, UserId } from '../types'
import { candidateFrom } from './candidates'
import { type HistorySnapshot, bucketBonus } from './reconnection'

/**
 * Greedy bucket selection (technical design section 5).
 *
 * Score = distinct people + capped reconnection bonus. Take the best, remove its people from every
 * other candidate, recompute windows and bonuses from scratch, and repeat until nothing with two
 * people remains. Deliberately not a global optimum.
 */

export function scoreCandidate(candidate: Candidate, snapshot: HistorySnapshot): ScoredCandidate {
  const userIds = candidate.members.map((member) => member.userId)
  const bonus = bucketBonus(snapshot, userIds)
  return { ...candidate, peopleCount: userIds.length, bonus, score: userIds.length + bonus }
}

/** Higher score, then more people, then the longer window, then the earlier start, then stable key. */
export function compareCandidates(a: ScoredCandidate, b: ScoredCandidate): number {
  return (
    b.score - a.score ||
    b.peopleCount - a.peopleCount ||
    b.sharedEnd - b.sharedStart - (a.sharedEnd - a.sharedStart) ||
    a.sharedStart - b.sharedStart ||
    a.key.localeCompare(b.key)
  )
}

/** The candidate without the given people, or null once fewer than two remain. */
export function withoutMembers(
  candidate: Candidate,
  assigned: ReadonlySet<UserId>,
): Candidate | null {
  const members = candidate.members.filter((member) => !assigned.has(member.userId))
  if (members.length < 2) return null
  return candidateFrom(members)
}

export function selectBuckets(
  candidates: readonly Candidate[],
  snapshot: HistorySnapshot,
): ScoredCandidate[] {
  const selected: ScoredCandidate[] = []
  const assigned = new Set<UserId>()
  let remaining = [...candidates]
  while (remaining.length > 0) {
    const best = remaining
      .map((candidate) => scoreCandidate(candidate, snapshot))
      .sort(compareCandidates)[0]!
    selected.push(best)
    for (const member of best.members) assigned.add(member.userId)
    remaining = collapse(remaining.map((candidate) => withoutMembers(candidate, assigned)))
  }
  return selected
}

/** Drops nulls and merges candidates that became identical after removals. */
function collapse(candidates: readonly (Candidate | null)[]): Candidate[] {
  const byKey = new Map<string, Candidate>()
  for (const candidate of candidates) {
    if (candidate && !byKey.has(candidate.key)) byKey.set(candidate.key, candidate)
  }
  return [...byKey.values()]
}
