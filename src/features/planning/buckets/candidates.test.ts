import { describe, expect, it } from 'vitest'
import { hour, minute } from '@/lib/time'
import type { Segment } from '../types'
import { chooseSegmentPerUser, generateCandidates } from './candidates'

const base = Date.UTC(2026, 9, 3)
const at = (hours: number, minutes = 0) => base + hours * hour + minutes * minute
const seg = (userId: string, start: number, end: number, slotId = `slot-${userId}`): Segment => ({
  slotId,
  userId,
  revision: 1,
  start,
  end,
})

const users = (candidate: { members: { userId: string }[] }) =>
  candidate.members.map((m) => m.userId).join('')

describe('generateCandidates', () => {
  it('reproduces the worked example from the technical design', () => {
    const segments = [
      seg('A', at(11, 10), at(15)),
      seg('B', at(11, 40), at(14)),
      seg('C', at(12), at(15, 30)),
      seg('D', at(14), at(16)),
      seg('E', at(14, 15), at(16)),
    ]
    const candidates = generateCandidates(segments)
    expect(candidates.map(users)).toEqual(['AB', 'ABC', 'ACD', 'CDE'])
    const abc = candidates[1]!
    expect([abc.sharedStart, abc.sharedEnd]).toEqual([at(12), at(14)])
    const acd = candidates[2]!
    expect([acd.sharedStart, acd.sharedEnd]).toEqual([at(14), at(15)])
    const cde = candidates[3]!
    expect([cde.sharedStart, cde.sharedEnd]).toEqual([at(14, 15), at(15, 30)])
  })

  it('accepts exactly 60 minutes and rejects 59 or boundary-only contact', () => {
    expect(generateCandidates([seg('A', at(10), at(11)), seg('B', at(10), at(12))])).toHaveLength(1)
    expect(
      generateCandidates([seg('A', at(10), at(10, 59)), seg('B', at(10), at(12))]),
    ).toHaveLength(0)
    expect(generateCandidates([seg('A', at(10), at(12)), seg('B', at(12), at(14))])).toHaveLength(0)
  })

  it('counts a person once even with several qualifying slots', () => {
    const candidates = generateCandidates([
      seg('A', at(10), at(12), 'slot-a1'),
      seg('A', at(10), at(13), 'slot-a2'),
      seg('B', at(10), at(12)),
    ])
    expect(candidates).toHaveLength(1)
    expect(candidates[0]!.members.map((m) => m.slotId)).toEqual(['slot-a2', 'slot-B'])
  })

  it('collapses identical member sets reached from different starts', () => {
    const candidates = generateCandidates([seg('A', at(10), at(14)), seg('B', at(10, 30), at(14))])
    expect(candidates).toHaveLength(1)
    expect([candidates[0]!.sharedStart, candidates[0]!.sharedEnd]).toEqual([at(10, 30), at(14)])
  })

  it('drops singletons', () => {
    expect(generateCandidates([seg('A', at(10), at(14))])).toEqual([])
  })
})

describe('chooseSegmentPerUser', () => {
  it('prefers the latest end, then the smaller slot id, and sorts by user', () => {
    const members = chooseSegmentPerUser([
      seg('B', at(10), at(12), 'z'),
      seg('B', at(10), at(12), 'y'),
      seg('A', at(10), at(11), 'q'),
      seg('A', at(10), at(13), 'p'),
    ])
    expect(members.map((m) => [m.userId, m.slotId])).toEqual([
      ['A', 'p'],
      ['B', 'y'],
    ])
  })
})
