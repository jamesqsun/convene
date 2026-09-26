/**
 * Time-zone arithmetic on top of the Intl API, with no date library.
 *
 * Instants are epoch milliseconds. Local dates are `YYYY-MM-DD` strings. Everything that turns a
 * local wall-clock time into an instant goes through `zonedTime`, which is DST-correct: it never
 * adds fixed 24-hour periods, and it resolves nonexistent or ambiguous wall times deterministically.
 */

export const minute = 60_000
export const hour = 3_600_000
export const day = 86_400_000

/** The spec's advance-assignment guarantee: an event may only be booked 48 elapsed hours ahead. */
export const advanceAssignmentMs = 48 * hour

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
export const weekdayNames = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    })
    formatters.set(timeZone, formatter)
  }
  return formatter
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatterFor(timeZone)
    return true
  } catch {
    return false
  }
}

export interface LocalParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  /** 0 = Sunday, matching JavaScript's Date. */
  weekday: number
}

export function localParts(timeZone: string, instant: number): LocalParts {
  const parts = formatterFor(timeZone).formatToParts(new Date(instant))
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value)
  const weekdayLabel = parts.find((part) => part.type === 'weekday')?.value ?? 'Sun'
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
    weekday: weekdays.indexOf(weekdayLabel as (typeof weekdays)[number]),
  }
}

/** The wall clock at `instant`, encoded as if it were UTC. Handy for offset math. */
function wallClockOf(timeZone: string, instant: number): number {
  const p = localParts(timeZone, instant)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
}

/** UTC offset in milliseconds at `instant` (positive east of Greenwich). */
export function offsetAt(timeZone: string, instant: number): number {
  const wholeSeconds = Math.floor(instant / 1000) * 1000
  return wallClockOf(timeZone, wholeSeconds) - wholeSeconds
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function localDateOf(timeZone: string, instant: number): string {
  const p = localParts(timeZone, instant)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

export function localClockOf(timeZone: string, instant: number): string {
  const p = localParts(timeZone, instant)
  return `${pad(p.hour)}:${pad(p.minute)}`
}

export function parseLocalDate(date: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) throw new Error(`Invalid local date "${date}"`)
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
}

/** Calendar arithmetic on a date label; safe across month and year ends. */
export function addLocalDays(date: string, days: number): string {
  const { year, month, day: dayOfMonth } = parseLocalDate(date)
  const shifted = new Date(Date.UTC(year, month - 1, dayOfMonth + days))
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`
}

/**
 * The instant at which `date hh:mm` happens in `timeZone`.
 *
 * Two offset guesses (one from before, one from after any nearby transition) cover every case.
 * Where DST makes the wall time ambiguous the later
 * instant (standard time) wins, matching how Postgres resolves `timestamp AT TIME ZONE`, so the SQL
 * `local_day_bounds` and this function always agree. Where DST makes the wall time nonexistent the
 * time is shifted forward past the gap.
 */
export function zonedTime(timeZone: string, date: string, hourOfDay = 0, minuteOfHour = 0): number {
  const { year, month, day: dayOfMonth } = parseLocalDate(date)
  const wanted = Date.UTC(year, month - 1, dayOfMonth, hourOfDay, minuteOfHour)
  // Offsets a day either side of the target bracket any DST transition near it.
  const usingEarlierOffset = wanted - offsetAt(timeZone, wanted - day)
  const usingLaterOffset = wanted - offsetAt(timeZone, wanted + day)
  const exact = [usingEarlierOffset, usingLaterOffset].filter(
    (candidate) => wallClockOf(timeZone, candidate) === wanted,
  )
  if (exact.length > 0) return Math.max(...exact)
  return Math.max(usingEarlierOffset, usingLaterOffset)
}

export interface DayBounds {
  localDate: string
  /** Inclusive start instant. */
  start: number
  /** Exclusive end instant: the next day's first instant. */
  end: number
}

/** Bounds of a city-local calendar day, 23 or 25 hours long on DST days. */
export function localDayBounds(timeZone: string, date: string): DayBounds {
  return {
    localDate: date,
    start: zonedTime(timeZone, date),
    end: zonedTime(timeZone, addLocalDays(date, 1)),
  }
}

/** Earliest instant an event booked at `bookingTime` may start. */
export function cutoffFor(bookingTime: number): number {
  return bookingTime + advanceAssignmentMs
}

export function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}
