import { describe, expect, it } from 'vitest'
import { zonedTime } from '@/lib/time'
import {
  cellKey,
  cellsForRange,
  isSameSelection,
  isWeekStart,
  lineCells,
  rowClock,
  rowsPerDay,
  selectionFromRanges,
  weekStartOf,
  windowsFromSelection,
} from './week-grid'

const tz = 'America/Toronto'

describe('week grid', () => {
  it('finds Mondays and clocks', () => {
    expect(weekStartOf(tz, zonedTime(tz, '2026-10-04', 23))).toBe('2026-09-28')
    expect(isWeekStart(tz, '2026-09-28')).toBe(true)
    expect(isWeekStart(tz, '2026-09-29')).toBe(false)
    expect(rowClock(0)).toBe('06:00')
    expect(rowClock(rowsPerDay)).toBe('24:00')
  })

  it('maps ranges to cells and back to windows', () => {
    const friday = { start: zonedTime(tz, '2026-10-02', 18), end: zonedTime(tz, '2026-10-02', 20) }
    const cells = cellsForRange(friday, '2026-09-28', tz)
    expect(cells).toEqual([cellKey(4, 24), cellKey(4, 25), cellKey(4, 26), cellKey(4, 27)])
    const selected = selectionFromRanges(
      [friday, { start: zonedTime(tz, '2026-10-04', 23), end: zonedTime(tz, '2026-10-05', 0) }],
      '2026-09-28',
      tz,
    )
    expect(windowsFromSelection(selected)).toEqual([
      { day: 4, start: '18:00', end: '20:00' },
      { day: 6, start: '23:00', end: '24:00' },
    ])
  })

  it('ignores cells outside the week or the visible hours', () => {
    expect(
      cellsForRange(
        { start: zonedTime(tz, '2026-10-05', 9), end: zonedTime(tz, '2026-10-05', 10) },
        '2026-09-28',
        tz,
      ),
    ).toEqual([])
    expect(
      cellsForRange(
        { start: zonedTime(tz, '2026-09-28', 4), end: zonedTime(tz, '2026-09-28', 7) },
        '2026-09-28',
        tz,
      ),
    ).toEqual([cellKey(0, 0), cellKey(0, 1)])
  })

  it('compares selections', () => {
    expect(isSameSelection(new Set(['0:1']), new Set(['0:1']))).toBe(true)
    expect(isSameSelection(new Set(['0:1']), new Set(['0:2']))).toBe(false)
  })

  it('fills every cell a fast drag would have swept, not just the endpoints', () => {
    // A quick swipe straight down one day column: every row in between must be included.
    expect(lineCells({ day: 2, row: 3 }, { day: 2, row: 7 })).toEqual([
      { day: 2, row: 3 },
      { day: 2, row: 4 },
      { day: 2, row: 5 },
      { day: 2, row: 6 },
      { day: 2, row: 7 },
    ])
    // Same cell twice (no movement) still yields that one cell.
    expect(lineCells({ day: 1, row: 1 }, { day: 1, row: 1 })).toEqual([{ day: 1, row: 1 }])
    // A diagonal jump interpolates day and row together rather than skipping either.
    expect(lineCells({ day: 0, row: 0 }, { day: 2, row: 2 })).toEqual([
      { day: 0, row: 0 },
      { day: 1, row: 1 },
      { day: 2, row: 2 },
    ])
    // Direction is symmetric: walking backwards retraces the same cells in reverse.
    expect(lineCells({ day: 2, row: 7 }, { day: 2, row: 3 })).toEqual(
      [...lineCells({ day: 2, row: 3 }, { day: 2, row: 7 })].reverse(),
    )
  })
})
