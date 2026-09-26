import { describe, expect, it } from 'vitest'
import { zonedTime } from './time'
import { formatDateTime, formatDaysAgo, formatTimeRange, zoneLabel } from './format'

const tz = 'America/Toronto'
const start = zonedTime(tz, '2026-10-03', 18)

describe('format', () => {
  it('formats in the requested zone', () => {
    expect(formatDateTime(start, tz)).toBe('Sat, Oct 3, 6:00 PM')
    expect(formatTimeRange(start, start + 5_400_000, tz)).toBe(
      'Saturday, October 3, 6:00 PM to 7:30 PM',
    )
    expect(zoneLabel(start, tz)).toBe('EDT')
  })

  it('describes recency in days', () => {
    expect(formatDaysAgo(start, start)).toBe('today')
    expect(formatDaysAgo(start - 86_400_000, start)).toBe('yesterday')
    expect(formatDaysAgo(start - 5 * 86_400_000, start)).toBe('5 days ago')
  })
})
