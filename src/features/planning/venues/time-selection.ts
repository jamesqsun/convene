import { localParts, minute } from '@/lib/time'
import type { OpeningPeriod } from './provider'

/**
 * Exact event time (technical design section 8): the earliest start on a 15-minute grid inside the
 * group's shared window such that the whole activity fits and, when hours are known, the venue is
 * open throughout. Unknown hours are accepted but flagged unverified.
 */

export const startStepMs = 15 * minute
const minutesPerDay = 1440
const minutesPerWeek = 7 * minutesPerDay

export interface EventInterval {
  start: number
  end: number
  isHoursVerified: boolean
}

interface WeekSpan {
  open: number
  close: number
}

/** Opening periods as minute-of-week spans; a period that closes before it opens wraps the week. */
function weekSpans(hours: readonly OpeningPeriod[]): WeekSpan[] | 'always' {
  const spans: WeekSpan[] = []
  for (const period of hours) {
    if (period.closeDay === null || period.closeMinutes === null) return 'always'
    const open = period.openDay * minutesPerDay + period.openMinutes
    let close = period.closeDay * minutesPerDay + period.closeMinutes
    if (close <= open) close += minutesPerWeek
    spans.push({ open, close })
  }
  return spans
}

export function isOpenDuring(
  hours: readonly OpeningPeriod[],
  start: number,
  end: number,
  timeZone: string,
): boolean {
  const spans = weekSpans(hours)
  if (spans === 'always') return true
  const parts = localParts(timeZone, start)
  const startMinute = parts.weekday * minutesPerDay + parts.hour * 60 + parts.minute
  const endMinute = startMinute + Math.ceil((end - start) / minute)
  return spans.some(
    (span) =>
      (span.open <= startMinute && endMinute <= span.close) ||
      (span.open <= startMinute + minutesPerWeek && endMinute + minutesPerWeek <= span.close),
  )
}

export function chooseEventInterval(
  window: { start: number; end: number },
  durationMs: number,
  hours: readonly OpeningPeriod[] | null,
  timeZone: string,
): EventInterval | null {
  for (let start = window.start; start + durationMs <= window.end; start += startStepMs) {
    const end = start + durationMs
    if (hours === null) return { start, end, isHoursVerified: false }
    if (isOpenDuring(hours, start, end, timeZone)) return { start, end, isHoursVerified: true }
  }
  return null
}
