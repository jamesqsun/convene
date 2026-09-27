'use client'

import { useRef, useState } from 'react'
import { addLocalDays, zonedTime } from '@/lib/time'
import type { WeekView } from './weeks'
import { cellKey, cellsForRange, lineCells, rowClock, rowsPerDay, weekDays } from './week-grid'

export interface WeekGridProps {
  week: WeekView
  selected: ReadonlySet<string>
  onChange: (next: Set<string>) => void
}

const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

interface Overlay {
  label: string
  kind: 'busy' | 'event'
}

/** First-cell labels and per-cell kinds for busy time and assigned hangouts. */
function overlaysFor(week: WeekView): Map<string, Overlay> {
  const overlays = new Map<string, Overlay>()
  for (const block of week.busy) {
    const cells = cellsForRange(
      { start: block.startsAt, end: block.endsAt },
      week.weekStart,
      week.timeZone,
    )
    cells.forEach((cell, index) =>
      overlays.set(cell, { label: index === 0 ? block.summary : '', kind: 'busy' }),
    )
  }
  for (const event of week.events) {
    const cells = cellsForRange(
      { start: event.startsAt, end: event.endsAt },
      week.weekStart,
      week.timeZone,
    )
    cells.forEach((cell, index) =>
      overlays.set(cell, { label: index === 0 ? event.activityName : '', kind: 'event' }),
    )
  }
  return overlays
}

/** Diagonal hatching so busy time reads as blocked without relying on colour alone. */
const busyHatch =
  'bg-[repeating-linear-gradient(135deg,transparent_0_5px,color-mix(in_oklab,var(--color-muted)_16%,transparent)_5px_7px)]'

function cellClass(isOn: boolean, overlay: Overlay | undefined, isLocked: boolean): string {
  if (overlay?.kind === 'event') return 'bg-sage-deep font-bold text-white'
  if (overlay?.kind === 'busy')
    return isOn
      ? `bg-line font-semibold text-ink ${busyHatch} shadow-[inset_3px_0_0_var(--color-sage)]`
      : `bg-line font-semibold text-muted ${busyHatch}`
  if (isLocked) return 'bg-linen text-muted/60'
  return isOn ? 'bg-sage text-white' : 'bg-surface hover:bg-soft'
}

/** Seven columns of 30-minute cells. Drag across cells to paint or clear availability. */
export function WeekGrid({ week, selected, onChange }: WeekGridProps) {
  const overlays = overlaysFor(week)
  const painting = useRef<{
    mode: boolean
    next: Set<string>
    lastCell: { day: number; row: number } | null
  } | null>(null)
  const [, forceRender] = useState(0)
  const rowInstant = (day: number, row: number) => {
    const [hour, minuteOfHour] = rowClock(row).split(':').map(Number)
    return zonedTime(week.timeZone, addLocalDays(week.weekStart, day), hour, minuteOfHour)
  }
  const isLockedCell = (day: number, row: number) => {
    const key = cellKey(day, row)
    return overlays.get(key)?.kind === 'event' || rowInstant(day, row + 1) < week.plannableAfter
  }

  function applyCell(day: number, row: number) {
    if (!painting.current || isLockedCell(day, row)) return
    const key = cellKey(day, row)
    if (painting.current.mode) painting.current.next.add(key)
    else painting.current.next.delete(key)
  }

  function paint(target: Element | null) {
    const cellAttr = target?.closest<HTMLElement>('[data-cell]')?.dataset.cell
    if (!cellAttr || !painting.current) return
    const [day, row] = cellAttr.split(':').map(Number) as [number, number]
    const last = painting.current.lastCell
    // A fast drag can skip pointermove samples entirely; fill every cell swept in between so
    // painting a whole column works the same at any speed, matching when2meet's drag-select.
    for (const cell of last ? lineCells(last, { day, row }) : [{ day, row }])
      applyCell(cell.day, cell.row)
    painting.current.lastCell = { day, row }
    forceRender((n) => n + 1)
  }

  function start(event: React.PointerEvent<HTMLElement>, key: string) {
    if (!(event.target as Element).closest('[data-cell]')) return
    painting.current = { mode: !selected.has(key), next: new Set(selected), lastCell: null }
    paint(event.target as Element)
  }

  function finish() {
    if (!painting.current) return
    onChange(painting.current.next)
    painting.current = null
  }

  const current = painting.current?.next ?? selected
  return (
    <div
      className="select-none overflow-x-auto rounded-2xl border border-line bg-surface"
      style={{ touchAction: 'none' }}
      onPointerMove={(event) =>
        painting.current && paint(document.elementFromPoint(event.clientX, event.clientY))
      }
      onPointerUp={finish}
      onPointerLeave={finish}
    >
      <table className="w-full min-w-[320px] table-fixed border-collapse text-[10px] leading-tight">
        <thead>
          <tr>
            <th aria-label="Time" className="w-14 border-r border-b border-line bg-linen" />
            {dayLabels.map((label, day) => (
              <th
                key={label}
                className="border-b border-line bg-linen px-0.5 py-2 text-[11px] font-extrabold text-ink"
              >
                {label}
                <span className="block font-semibold text-muted">
                  {addLocalDays(week.weekStart, day).slice(8)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rowsPerDay }, (_, row) => (
            <tr key={row}>
              {/* Each label sits just under its hour line, like the first one under the header, so
                  no line crosses text. Every grid line is a cell border (none inside the buttons),
                  so the time column and the day columns share exactly the same row edges. */}
              <th
                className={`border-r border-line bg-surface p-0 text-center align-top text-xs font-semibold text-muted tabular-nums ${row % 2 === 1 ? 'border-b' : ''}`}
              >
                {row % 2 === 0 && <span className="block pt-1 leading-none">{rowClock(row)}</span>}
              </th>
              {Array.from({ length: weekDays }, (_, day) => {
                const key = cellKey(day, row)
                const overlay = overlays.get(key)
                const isLocked = isLockedCell(day, row)
                return (
                  <td
                    key={key}
                    className={`border-r border-b p-0 ${row % 2 === 1 ? 'border-line' : 'border-line/50'}`}
                  >
                    <button
                      type="button"
                      data-cell={key}
                      aria-pressed={current.has(key)}
                      aria-label={`${dayLabels[day]} ${rowClock(row)}${overlay?.label ? `, ${overlay.label}` : ''}`}
                      disabled={isLocked}
                      onPointerDown={(event) => start(event, key)}
                      className={`block h-6 w-full truncate px-1 text-left transition-colors ${cellClass(current.has(key), overlay, isLocked)}`}
                    >
                      {overlay?.label}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
