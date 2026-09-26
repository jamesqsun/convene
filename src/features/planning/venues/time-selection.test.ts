import { describe, expect, it } from 'vitest'
import { hour, minute, zonedTime } from '@/lib/time'
import type { OpeningPeriod } from './provider'
import { chooseEventInterval, isOpenDuring } from './time-selection'

const tz = 'America/Toronto'
// 2026-10-03 is a Saturday.
const at = (h: number, m = 0) => zonedTime(tz, '2026-10-03', h, m)
const saturday = 6
const sunday = 0

function minutesOf(clock: string): number {
  const [h, m] = clock.split(':').map(Number)
  return h! * 60 + m!
}

const period = (
  openDay: number,
  open: string,
  closeDay: number | null,
  close: string | null,
): OpeningPeriod => ({
  openDay,
  openMinutes: minutesOf(open),
  closeDay,
  closeMinutes: close === null ? null : minutesOf(close),
})

describe('isOpenDuring', () => {
  it('requires the whole interval to fall inside an opening period', () => {
    const hours = [period(saturday, '09:00', saturday, '17:00')]
    expect(isOpenDuring(hours, at(10), at(11), tz)).toBe(true)
    expect(isOpenDuring(hours, at(16, 30), at(17, 30), tz)).toBe(false)
    expect(isOpenDuring(hours, at(8), at(9), tz)).toBe(false)
  })

  it('handles closing after midnight and week wrap', () => {
    const lateBar = [period(saturday, '18:00', sunday, '02:00')]
    expect(isOpenDuring(lateBar, at(23), at(25), tz)).toBe(true)
    const sundayEvent = zonedTime(tz, '2026-10-04', 1)
    expect(isOpenDuring(lateBar, sundayEvent, sundayEvent + hour, tz)).toBe(true)
    expect(isOpenDuring(lateBar, at(17), at(19), tz)).toBe(false)
  })

  it('treats a period without a close as always open', () => {
    expect(isOpenDuring([period(sunday, '00:00', null, null)], at(3), at(4), tz)).toBe(true)
  })
})

describe('chooseEventInterval', () => {
  const window = { start: at(10), end: at(14) }

  it('starts at the window start when hours are unknown and flags them unverified', () => {
    expect(chooseEventInterval(window, 90 * minute, null, tz)).toEqual({
      start: at(10),
      end: at(11, 30),
      isHoursVerified: false,
    })
  })

  it('steps forward in 15-minute increments until the venue is open', () => {
    const hours = [period(saturday, '11:20', saturday, '20:00')]
    expect(chooseEventInterval(window, hour, hours, tz)).toEqual({
      start: at(11, 30),
      end: at(12, 30),
      isHoursVerified: true,
    })
  })

  it('returns null when the activity cannot fit or the venue is closed throughout', () => {
    expect(chooseEventInterval(window, 5 * hour, null, tz)).toBeNull()
    expect(
      chooseEventInterval(window, hour, [period(saturday, '15:00', saturday, '20:00')], tz),
    ).toBeNull()
  })

  it('accepts an interval that exactly fills the window', () => {
    expect(chooseEventInterval(window, 4 * hour, null, tz)).toEqual({
      start: at(10),
      end: at(14),
      isHoursVerified: false,
    })
  })
})
