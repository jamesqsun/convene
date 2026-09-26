import { describe, expect, it } from 'vitest'
import { zonedTime } from '@/lib/time'
import {
  cellKey,
  cellsForRange,
  isSameSelection,
  isWeekStart,
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
})
