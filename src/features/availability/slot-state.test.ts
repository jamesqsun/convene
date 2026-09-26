import { describe, expect, it } from 'vitest'
import { hour, zonedTime } from '@/lib/time'
import { expectedBatchAt, slotStateFor } from './slot-state'

const tz = 'America/Toronto'
const wednesdayEvening = zonedTime(tz, '2026-09-30', 18)
const mondayMidnight = zonedTime(tz, '2026-09-28')

describe('slot state', () => {
  it('expects the batch at local midnight two days before the slot', () => {
    expect(expectedBatchAt({ startsAt: wednesdayEvening, timezone: tz })).toBe(mondayMidnight)
    // Across the fall-back transition the batch is still at midnight two calendar days earlier.
    expect(expectedBatchAt({ startsAt: zonedTime(tz, '2026-11-02', 18), timezone: tz })).toBe(
      zonedTime(tz, '2026-10-31'),
    )
  })

  it('derives waiting, catch-up, and unfilled from the clock for pending slots', () => {
    const slot = { startsAt: wednesdayEvening, timezone: tz, status: 'pending' as const }
    expect(slotStateFor(slot, mondayMidnight - hour)).toBe('waiting')
    expect(slotStateFor(slot, mondayMidnight + hour)).toBe('catch-up')
    expect(slotStateFor(slot, mondayMidnight + 23.5 * hour)).toBe('unfilled')
  })

  it('maps stored statuses directly', () => {
    const base = { startsAt: wednesdayEvening, timezone: tz }
    expect(slotStateFor({ ...base, status: 'filled' }, 0)).toBe('assigned')
    expect(slotStateFor({ ...base, status: 'paused' }, 0)).toBe('paused')
    expect(slotStateFor({ ...base, status: 'expired' }, 0)).toBe('unfilled')
    expect(slotStateFor({ ...base, status: 'cancelled' }, 0)).toBe('closed')
  })
})
