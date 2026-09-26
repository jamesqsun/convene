import { describe, expect, it } from 'vitest'
import {
  addLocalDays,
  advanceAssignmentMs,
  cutoffFor,
  hour,
  isValidTimeZone,
  localClockOf,
  localDateOf,
  localDayBounds,
  localParts,
  offsetAt,
  zonedTime,
} from './time'

const ny = 'America/New_York'

describe('localDayBounds', () => {
  it('is 24 hours on an ordinary day', () => {
    const bounds = localDayBounds(ny, '2026-06-01')
    expect(bounds.end - bounds.start).toBe(24 * hour)
    expect(new Date(bounds.start).toISOString()).toBe('2026-06-01T04:00:00.000Z')
  })

  it('is 23 hours when clocks spring forward and 25 when they fall back', () => {
    const spring = localDayBounds(ny, '2026-03-08')
    const fall = localDayBounds(ny, '2026-11-01')
    expect(spring.end - spring.start).toBe(23 * hour)
    expect(fall.end - fall.start).toBe(25 * hour)
  })

  it('handles European transitions', () => {
    expect(
      localDayBounds('Europe/London', '2026-03-29').end -
        localDayBounds('Europe/London', '2026-03-29').start,
    ).toBe(23 * hour)
    expect(
      localDayBounds('Europe/London', '2026-10-25').end -
        localDayBounds('Europe/London', '2026-10-25').start,
    ).toBe(25 * hour)
  })

  it('starts at the first existing instant when DST skips midnight', () => {
    const bounds = localDayBounds('America/Santiago', '2026-09-06')
    expect(localDateOf('America/Santiago', bounds.start)).toBe('2026-09-06')
    expect(localParts('America/Santiago', bounds.start).hour).toBe(1)
    expect(bounds.end - bounds.start).toBe(23 * hour)
  })

  it('uses half-hour offsets correctly', () => {
    expect(new Date(localDayBounds('Asia/Kolkata', '2026-01-01').start).toISOString()).toBe(
      '2025-12-31T18:30:00.000Z',
    )
  })
})

describe('zonedTime', () => {
  it('shifts a nonexistent wall time forward past the DST gap', () => {
    expect(new Date(zonedTime(ny, '2026-03-08', 2, 30)).toISOString()).toBe(
      '2026-03-08T07:30:00.000Z',
    )
  })

  it('picks the standard-time instant for an ambiguous wall time, like Postgres', () => {
    expect(new Date(zonedTime(ny, '2026-11-01', 1, 30)).toISOString()).toBe(
      '2026-11-01T06:30:00.000Z',
    )
    expect(new Date(zonedTime('America/Havana', '2026-11-01')).toISOString()).toBe(
      '2026-11-01T05:00:00.000Z',
    )
  })

  it('round-trips through localDateOf and localClockOf', () => {
    const instant = zonedTime('Pacific/Auckland', '2026-04-05', 11, 10)
    expect(localDateOf('Pacific/Auckland', instant)).toBe('2026-04-05')
    expect(localClockOf('Pacific/Auckland', instant)).toBe('11:10')
  })
})

describe('calendar helpers', () => {
  it('adds days across month and year boundaries', () => {
    expect(addLocalDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addLocalDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addLocalDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addLocalDays('2026-09-28', 2)).toBe('2026-09-30')
  })

  it('reports weekday and offset', () => {
    const monday = zonedTime(ny, '2026-09-28')
    expect(localParts(ny, monday).weekday).toBe(1)
    expect(offsetAt(ny, monday)).toBe(-4 * hour)
    expect(offsetAt(ny, zonedTime(ny, '2026-01-15'))).toBe(-5 * hour)
  })

  it('validates time zone names', () => {
    expect(isValidTimeZone('America/Toronto')).toBe(true)
    expect(isValidTimeZone('Mars/Olympus')).toBe(false)
  })

  it('cutoff is 48 elapsed hours regardless of DST', () => {
    const booking = zonedTime(ny, '2026-03-06', 12)
    expect(cutoffFor(booking) - booking).toBe(advanceAssignmentMs)
    expect(localClockOf(ny, cutoffFor(booking))).toBe('13:00')
  })
})
