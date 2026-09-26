import { minOverlapMs, type BucketMember, type Candidate, type Segment } from '../types'

/**
 * Candidate overlap buckets (technical design section 4).
 *
 * At every distinct segment start `t`, the people whose segment contains [t, t + 60 min) form a
 * candidate. Checking only segment starts is sufficient: any group's common window begins at its
 * latest member's start, and no instant between two starts can admit a new participant.
 */

export function candidateKey(members: readonly BucketMember[]): string {
  return members.map((member) => `${member.userId}:${member.slotId}:${member.revision}`).join(',')
}

export function windowOf(members: readonly BucketMember[]): {
  sharedStart: number
  sharedEnd: number
} {
  return {
    sharedStart: Math.max(...members.map((member) => member.segmentStart)),
    sharedEnd: Math.min(...members.map((member) => member.segmentEnd)),
  }
}

function qualifyingAt(segments: readonly Segment[], t: number): Segment[] {
  return segments.filter((segment) => segment.start <= t && segment.end >= t + minOverlapMs)
}

/** One member per person: the segment ending latest, then the smaller slot id. Sorted by user id. */
export function chooseSegmentPerUser(segments: readonly Segment[]): BucketMember[] {
  const byUser = new Map<string, Segment>()
  for (const segment of segments) {
    const current = byUser.get(segment.userId)
    const isBetter =
      !current ||
      segment.end > current.end ||
      (segment.end === current.end && segment.slotId < current.slotId)
    if (isBetter) byUser.set(segment.userId, segment)
  }
  return [...byUser.values()]
    .sort((a, b) => a.userId.localeCompare(b.userId))
    .map((segment) => ({
      userId: segment.userId,
      slotId: segment.slotId,
      revision: segment.revision,
      segmentStart: segment.start,
      segmentEnd: segment.end,
    }))
}

export function candidateFrom(members: BucketMember[]): Candidate {
  return { key: candidateKey(members), members, ...windowOf(members) }
}

export function generateCandidates(segments: readonly Segment[]): Candidate[] {
  const starts = [...new Set(segments.map((segment) => segment.start))].sort((a, b) => a - b)
  const candidates = new Map<string, Candidate>()
  for (const t of starts) {
    const members = chooseSegmentPerUser(qualifyingAt(segments, t))
    if (members.length < 2) continue
    const candidate = candidateFrom(members)
    // Identical participant/slot sets at different starts are the same pool; keep the first.
    if (!candidates.has(candidate.key)) candidates.set(candidate.key, candidate)
  }
  return [...candidates.values()]
}
