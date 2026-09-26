import { describe, expect, it } from 'vitest'
import { day, hour, minute } from '@/lib/time'
import type { BucketMember, Candidate, Segment } from '../types'
import { candidateFrom, generateCandidates } from './candidates'
import { type HistorySnapshot, emptySnapshot, pairKey } from './reconnection'
import { compareCandidates, scoreCandidate, selectBuckets, withoutMembers } from './select'

const base = Date.UTC(2026, 9, 3)
const at = (hours: number, minutes = 0) => base + hours * hour + minutes * minute
const seg = (userId: string, start: number, end: number): Segment => ({
  slotId: `slot-${userId}`,
  userId,
  revision: 1,
  start,
  end,
})
const member = (userId: string, start = at(10), end = at(12)): BucketMember => ({
  userId,
  slotId: `slot-${userId}`,
  revision: 1,
  segmentStart: start,
  segmentEnd: end,
})
const pool = (...userIds: string[]): Candidate => candidateFrom(userIds.map((id) => member(id)))
const users = (candidate: Candidate) => candidate.members.map((m) => m.userId).join('')
const none = emptySnapshot(base)

function friends(pairs: [string, string][], daysAgo = 100): HistorySnapshot {
  const snapshot = emptySnapshot(base)
  for (const [a, b] of pairs)
    snapshot.friendships[pairKey(a, b)] = { createdAt: base - daysAgo * day }
  return snapshot
}

describe('selectBuckets', () => {
  it('follows the worked example: ABC wins the tie on window length, then DE remains', () => {
    const candidates = generateCandidates([
      seg('A', at(11, 10), at(15)),
      seg('B', at(11, 40), at(14)),
      seg('C', at(12), at(15, 30)),
      seg('D', at(14), at(16)),
      seg('E', at(14, 15), at(16)),
    ])
    const selected = selectBuckets(candidates, none)
    expect(selected.map(users)).toEqual(['ABC', 'DE'])
    expect([selected[1]!.sharedStart, selected[1]!.sharedEnd]).toEqual([at(14, 15), at(16)])
  })

  it('reduces to largest-first without bonuses', () => {
    const selected = selectBuckets(
      [pool('A', 'B'), pool('C', 'D', 'E'), pool('F', 'G', 'H', 'I')],
      none,
    )
    expect(selected.map(users)).toEqual(['FGHI', 'CDE', 'AB'])
  })

  it('lets a slightly smaller bucket with overdue friends win', () => {
    const snapshot = friends([
      ['A', 'B'],
      ['C', 'D'],
    ])
    const six = pool('P', 'Q', 'R', 'S', 'T', 'U')
    const five = pool('A', 'B', 'C', 'D', 'E')
    expect(scoreCandidate(six, snapshot).score).toBe(6)
    expect(scoreCandidate(five, snapshot).score).toBe(7)
    expect(selectBuckets([six, five], snapshot).map(users)).toEqual(['ABCDE', 'PQRSTU'])
  })

  it('caps the bonus at half the people count', () => {
    const snapshot = friends([
      ['A', 'B'],
      ['A', 'C'],
      ['B', 'C'],
    ])
    expect(scoreCandidate(pool('A', 'B', 'C'), snapshot).score).toBe(4.5)
  })

  it('recomputes bonuses after removals so split pairs stop counting', () => {
    const snapshot = friends([['A', 'B']])
    const first = pool('A', 'X', 'Y', 'Z')
    const second = pool('A', 'B', 'C')
    const selected = selectBuckets([first, second], snapshot)
    expect(selected.map(users)).toEqual(['AXYZ', 'BC'])
    expect(selected[1]!.bonus).toBe(0)
    expect(selected[1]!.score).toBe(2)
  })

  it('leaves people unmatched when every remaining candidate is a singleton', () => {
    const selected = selectBuckets([pool('A', 'B'), pool('B', 'C')], none)
    expect(selected.map(users)).toEqual(['AB'])
  })

  it('breaks full ties by earliest start then key', () => {
    const early = candidateFrom([member('A', at(9), at(11)), member('B', at(9), at(11))])
    const late = candidateFrom([member('C', at(12), at(14)), member('D', at(12), at(14))])
    expect(
      compareCandidates(scoreCandidate(late, none), scoreCandidate(early, none)),
    ).toBeGreaterThan(0)
    const sameStart = candidateFrom([member('E', at(9), at(11)), member('F', at(9), at(11))])
    expect(
      compareCandidates(scoreCandidate(early, none), scoreCandidate(sameStart, none)),
    ).toBeLessThan(0)
  })

  it('is reproducible for the same input', () => {
    const candidates = [pool('A', 'B', 'C'), pool('B', 'C', 'D'), pool('D', 'E')]
    expect(selectBuckets(candidates, none)).toEqual(selectBuckets(candidates, none))
  })
})

describe('withoutMembers', () => {
  it('recomputes the window from the survivors', () => {
    const candidate = candidateFrom([
      member('A', at(10), at(12)),
      member('B', at(11), at(13)),
      member('C', at(10), at(14)),
    ])
    const trimmed = withoutMembers(candidate, new Set(['B']))!
    expect(users(trimmed)).toBe('AC')
    expect([trimmed.sharedStart, trimmed.sharedEnd]).toEqual([at(10), at(12)])
    expect(withoutMembers(candidate, new Set(['A', 'B']))).toBeNull()
  })
})
