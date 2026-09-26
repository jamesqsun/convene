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
