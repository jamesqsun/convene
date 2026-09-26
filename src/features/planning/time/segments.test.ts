import { describe, expect, it } from 'vitest'
import { hour, localDayBounds, minute } from '@/lib/time'
import type { SlotRow } from '../types'
import { clipSlotsToDay, withoutUsers } from './segments'

const tz = 'America/Toronto'
const day = localDayBounds(tz, '2026-10-03')
const at = (hours: number, minutes = 0) => day.start + hours * hour + minutes * minute
const slot = (id: string, startsAt: number, endsAt: number, userId = `user-${id}`): SlotRow => ({
  id,
  userId,
  startsAt,
  endsAt,
  revision: 1,
})

describe('clipSlotsToDay', () => {
  it('keeps a slot inside the day untouched', () => {
    const segments = clipSlotsToDay([slot('a', at(11, 10), at(15))], day, 0)
    expect(segments).toEqual([
      { slotId: 'a', userId: 'user-a', revision: 1, start: at(11, 10), end: at(15) },
    ])
  })

  it('clips a cross-midnight slot to the day on each side', () => {
    const late = slot('a', at(22), at(26))
    const today = clipSlotsToDay([late], day, 0)
    const tomorrow = clipSlotsToDay([late], localDayBounds(tz, '2026-10-04'), 0)
    expect(today[0]).toMatchObject({ start: at(22), end: day.end })
    expect(tomorrow[0]).toMatchObject({ start: day.end, end: at(26) })
  })

  it('clips the start to the cutoff and drops anything under 60 minutes', () => {
    const cutoff = at(14, 1)
    const kept = clipSlotsToDay([slot('a', at(13), at(15, 1))], day, cutoff)
    expect(kept[0]).toMatchObject({ start: cutoff, end: at(15, 1) })
    expect(clipSlotsToDay([slot('b', at(13), at(15))], day, cutoff)).toEqual([])
  })

  it('keeps exactly 60 minutes and drops 59', () => {
    expect(clipSlotsToDay([slot('a', at(10), at(11))], day, 0)).toHaveLength(1)
    expect(clipSlotsToDay([slot('b', at(10), at(10, 59))], day, 0)).toHaveLength(0)
  })

  it('ignores slots entirely outside the day', () => {
    expect(clipSlotsToDay([slot('a', day.end, day.end + 2 * hour)], day, 0)).toEqual([])
  })
})

describe('withoutUsers', () => {
  it('removes segments for excluded people', () => {
    const segments = clipSlotsToDay([slot('a', at(10), at(12)), slot('b', at(10), at(12))], day, 0)
    expect(withoutUsers(segments, new Set(['user-a'])).map((s) => s.userId)).toEqual(['user-b'])
  })
})
