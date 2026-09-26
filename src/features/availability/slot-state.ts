import { addLocalDays, localDateOf, zonedTime } from '@/lib/time'
import { isDateStillPlannable, targetOffsetDays } from '@/features/planning/batch/due'

export type SlotStatus = 'pending' | 'filled' | 'paused' | 'expired' | 'cancelled'

/** What the owner sees, derived from status and the clock rather than stored. */
export type SlotState = 'waiting' | 'catch-up' | 'assigned' | 'unfilled' | 'paused' | 'closed'

export interface SlotTiming {
  startsAt: number
  timezone: string
  status: SlotStatus
}

/** The city-local midnight two days before the slot's date: when its main batch runs. */
export function expectedBatchAt(slot: Pick<SlotTiming, 'startsAt' | 'timezone'>): number {
  const localDate = localDateOf(slot.timezone, slot.startsAt)
  return zonedTime(slot.timezone, addLocalDays(localDate, -targetOffsetDays))
}

export function slotStateFor(slot: SlotTiming, now: number): SlotState {
  switch (slot.status) {
    case 'filled':
      return 'assigned'
    case 'paused':
      return 'paused'
    case 'expired':
      return 'unfilled'
    case 'cancelled':
      return 'closed'
    case 'pending': {
      if (expectedBatchAt(slot) > now) return 'waiting'
      return isDateStillPlannable(slot.timezone, localDateOf(slot.timezone, slot.startsAt), now)
        ? 'catch-up'
        : 'unfilled'
    }
  }
}
