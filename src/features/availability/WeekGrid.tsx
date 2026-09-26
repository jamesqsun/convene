'use client'

import { useRef, useState } from 'react'
import { addLocalDays, localParts, zonedTime } from '@/lib/time'
import type { WeekView } from './weeks'
import { cellKey, cellsForRange, rowClock, rowsPerDay, weekDays } from './week-grid'

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

function cellClass(isOn: boolean, overlay: Overlay | undefined, isLocked: boolean): string {
  if (overlay?.kind === 'event') return 'bg-emerald-600 text-white'
  if (isLocked) return 'bg-stone-100 text-stone-300'
  if (overlay?.kind === 'busy')
    return isOn ? 'bg-amber-200 text-amber-900' : 'bg-amber-100 text-amber-800'
  return isOn ? 'bg-stone-900 text-white' : 'bg-white hover:bg-stone-100'
}

/** Seven columns of 30-minute cells. Drag across cells to paint or clear availability. */
export function WeekGrid({ week, selected, onChange }: WeekGridProps) {
  const overlays = overlaysFor(week)
  const painting = useRef<{ mode: boolean; next: Set<string> } | null>(null)
  const [, forceRender] = useState(0)
  const rowInstant = (day: number, row: number) => {
    const [hour, minuteOfHour] = rowClock(row).split(':').map(Number)
    return zonedTime(week.timeZone, addLocalDays(week.weekStart, day), hour, minuteOfHour)
  }
  const isLockedCell = (day: number, row: number) => {
    const key = cellKey(day, row)
    return overlays.get(key)?.kind === 'event' || rowInstant(day, row + 1) < week.plannableAfter
  }

  function paint(target: Element | null) {
    const cell = target?.closest<HTMLElement>('[data-cell]')?.dataset.cell
    if (!cell || !painting.current) return
    const { day, row } = { day: Number(cell.split(':')[0]), row: Number(cell.split(':')[1]) }
    if (isLockedCell(day, row)) return
    if (painting.current.mode) painting.current.next.add(cell)
    else painting.current.next.delete(cell)
    forceRender((n) => n + 1)
  }

  function start(event: React.PointerEvent<HTMLElement>, key: string) {
    if (!(event.target as Element).closest('[data-cell]')) return
    painting.current = { mode: !selected.has(key), next: new Set(selected) }
    paint(event.target as Element)
  }

  function finish() {
    if (!painting.current) return
    onChange(painting.current.next)
    painting.current = null
  }

  const current = painting.current?.next ?? selected
  const weekStartInstant = zonedTime(week.timeZone, week.weekStart)
  return (
    <div
      className="select-none overflow-x-auto rounded-xl border border-stone-200 bg-white"
      style={{ touchAction: 'none' }}
      onPointerMove={(event) =>
        painting.current && paint(document.elementFromPoint(event.clientX, event.clientY))
      }
      onPointerUp={finish}
      onPointerLeave={finish}
    >
      <table className="w-full table-fixed border-collapse text-[10px] leading-tight">
        <thead>
          <tr>
            <th className="w-10 bg-stone-50 p-1 text-left font-normal text-stone-500">
              {localParts(week.timeZone, weekStartInstant).month}/
              {localParts(week.timeZone, weekStartInstant).day}
            </th>
            {dayLabels.map((label, day) => (
              <th key={label} className="bg-stone-50 p-1 font-semibold text-stone-700">
                {label}{' '}
                <span className="font-normal text-stone-400">
                  {addLocalDays(week.weekStart, day).slice(8)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rowsPerDay }, (_, row) => (
            <tr key={row}>
              <th
                className={`bg-stone-50 pr-1 text-right align-top font-normal text-stone-400 ${row % 2 === 0 ? '' : 'invisible'}`}
              >
                {rowClock(row)}
              </th>
              {Array.from({ length: weekDays }, (_, day) => {
                const key = cellKey(day, row)
                const overlay = overlays.get(key)
                const isLocked = isLockedCell(day, row)
                return (
                  <td key={key} className="p-0">
                    <button
                      type="button"
                      data-cell={key}
                      aria-pressed={current.has(key)}
                      aria-label={`${dayLabels[day]} ${rowClock(row)}${overlay?.label ? `, ${overlay.label}` : ''}`}
                      disabled={isLocked}
                      onPointerDown={(event) => start(event, key)}
                      className={`h-5 w-full truncate border-b border-r border-stone-100 px-0.5 text-left ${cellClass(current.has(key), overlay, isLocked)} ${row % 2 === 1 ? 'border-b-stone-200' : ''}`}
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
