import { addLocalDays, localDateOf, localParts, minute, zonedTime } from '@/lib/time'

/**
 * Pure week-grid arithmetic shared by the server (week bounds) and the browser (cell mapping).
 * The grid is Monday to Sunday, 06:00 to 24:00, in 30-minute cells. Windows are derived from
 * selected cells, so the server never sees pixels, only day-of-week plus clock times.
 */

export const firstHour = 6
export const lastHour = 24
export const cellMinutes = 30
export const rowsPerDay = ((lastHour - firstHour) * 60) / cellMinutes
export const weekDays = 7

export function weekStartOf(timeZone: string, instant: number): string {
  const date = localDateOf(timeZone, instant)
  const weekday = localParts(timeZone, instant).weekday
  const daysSinceMonday = (weekday + 6) % 7
  return addLocalDays(date, -daysSinceMonday)
}

export function isWeekStart(timeZone: string, date: string): boolean {
  return weekStartOf(timeZone, zonedTime(timeZone, date, 12)) === date
}

export function cellKey(day: number, row: number): string {
  return `${day}:${row}`
}

export function parseCellKey(key: string): { day: number; row: number } {
  const [day, row] = key.split(':').map(Number)
  return { day: day!, row: row! }
}

export function rowClock(row: number): string {
  const minutes = firstHour * 60 + row * cellMinutes
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

function rowOf(minutesIntoDay: number): number {
  return (minutesIntoDay - firstHour * 60) / cellMinutes
}

/** Grid cells (day, row) covered by an absolute range, clipped to the visible hours. */
export function cellsForRange(
  range: { start: number; end: number },
  weekStart: string,
  timeZone: string,
): string[] {
  const cells: string[] = []
  const dates = Array.from({ length: weekDays }, (_, day) => addLocalDays(weekStart, day))
  for (let instant = range.start; instant < range.end; instant += cellMinutes * minute) {
    const day = dates.indexOf(localDateOf(timeZone, instant))
    if (day < 0) continue
    const parts = localParts(timeZone, instant)
    const row = rowOf(parts.hour * 60 + parts.minute)
    if (row < 0 || row >= rowsPerDay || !Number.isInteger(row)) continue
    cells.push(cellKey(day, row))
  }
  return cells
}

/** Merges each day's selected cells into windows for the save request. */
export function windowsFromSelection(
  selected: ReadonlySet<string>,
): { day: number; start: string; end: string }[] {
  const windows: { day: number; start: string; end: string }[] = []
  for (let day = 0; day < weekDays; day += 1) {
    let runStart: number | null = null
    for (let row = 0; row <= rowsPerDay; row += 1) {
      const isOn = row < rowsPerDay && selected.has(cellKey(day, row))
      if (isOn && runStart === null) runStart = row
      if (!isOn && runStart !== null) {
        windows.push({ day, start: rowClock(runStart), end: rowClock(row) })
        runStart = null
      }
    }
  }
  return windows
}

export function selectionFromRanges(
  ranges: readonly { start: number; end: number }[],
  weekStart: string,
  timeZone: string,
): Set<string> {
  const selected = new Set<string>()
  for (const range of ranges)
    for (const cell of cellsForRange(range, weekStart, timeZone)) selected.add(cell)
  return selected
}

export function isSameSelection(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false
  for (const key of a) if (!b.has(key)) return false
  return true
}
