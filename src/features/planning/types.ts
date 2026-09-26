import { minute } from '@/lib/time'

/**
 * Shared shapes for the planning pipeline. Everything here is plain data: instants are epoch
 * milliseconds and the modules that consume these types do no I/O.
 */

export type UserId = string
export type SlotId = string

/** Unordered pair identity: `${smallerId}|${largerId}`. */
export type PairKey = string

/** A pending availability slot as loaded for a batch. */
export interface SlotRow {
  id: SlotId
  userId: UserId
  startsAt: number
  endsAt: number
  revision: number
}

/** The usable part of a slot on one local date, after clipping to the day and the 48-hour cutoff. */
export interface Segment {
  slotId: SlotId
  userId: UserId
  revision: number
  start: number
  end: number
}

/** One person's place in a candidate or group, with the slot that will be filled. */
export interface BucketMember {
  userId: UserId
  slotId: SlotId
  revision: number
  segmentStart: number
  segmentEnd: number
}

/** A provisional pool of people who share at least the minimum overlap. */
export interface Candidate {
  /** Deterministic identity from members and source slots; identical candidates collapse. */
  key: string
  members: BucketMember[]
  sharedStart: number
  sharedEnd: number
}

export interface ScoredCandidate extends Candidate {
  peopleCount: number
  bonus: number
  score: number
}

/** What the grouping and activity stages know about a person. Never includes phone or location. */
export interface ProfileSnapshot {
  userId: UserId
  embedding: number[] | null
  interests: string[]
  /** Already limited to the most confident few by the loader. */
  memories: { topic: string; summary: string }[]
}

/** The spec's minimum common availability for bucket eligibility. Not an event length. */
export const minOverlapMs = 60 * minute

export const minGroupSize = 2
export const maxGroupSize = 10
