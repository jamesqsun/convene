import type { DayBounds } from '@/lib/time'
import { minOverlapMs, type Segment, type SlotRow, type UserId } from '../types'

/**
 * Clips each slot to the target local day and to the advance-assignment cutoff.
 *
 * A slot that crosses midnight yields one segment on each date it touches; the commit step's
 * one-event-per-slot rule guarantees it is filled at most once. Segments shorter than the minimum
 * overlap can never form a bucket and are dropped here.
 */
export function clipSlotsToDay(
  slots: readonly SlotRow[],
  dayBounds: DayBounds,
  cutoff: number,
): Segment[] {
  const segments: Segment[] = []
  for (const slot of slots) {
    const start = Math.max(slot.startsAt, dayBounds.start, cutoff)
    const end = Math.min(slot.endsAt, dayBounds.end)
    if (end - start < minOverlapMs) continue
    segments.push({ slotId: slot.id, userId: slot.userId, revision: slot.revision, start, end })
  }
  return segments
}

/** Drops segments belonging to people who already hold an assignment for the date. */
export function withoutUsers(
  segments: readonly Segment[],
  excluded: ReadonlySet<UserId>,
): Segment[] {
  return segments.filter((segment) => !excluded.has(segment.userId))
}

export interface BusyRange {
  startsAt: number
  endsAt: number
}

/** Removes each person's busy time from their segments, keeping only remainders of at least an hour. */
export function subtractBusy(
  segments: readonly Segment[],
  busyByUser: ReadonlyMap<UserId, readonly BusyRange[]>,
): Segment[] {
  const result: Segment[] = []
  for (const segment of segments) {
    let pieces: Segment[] = [segment]
    for (const busy of busyByUser.get(segment.userId) ?? []) {
      pieces = pieces.flatMap((piece) => {
        if (busy.endsAt <= piece.start || busy.startsAt >= piece.end) return [piece]
        const remainders: Segment[] = []
        if (busy.startsAt > piece.start) remainders.push({ ...piece, end: busy.startsAt })
        if (busy.endsAt < piece.end) remainders.push({ ...piece, start: busy.endsAt })
        return remainders
      })
    }
    result.push(...pieces.filter((piece) => piece.end - piece.start >= minOverlapMs))
  }
  return result
}
