'use client'

import Link from 'next/link'
import { formatDateTime, formatTimeRange } from '@/lib/format'
import type { SlotState } from './slot-state'
import type { Slot } from './store'

export type SlotView = Slot & { state: SlotState; expectedBatchAt: number }

export interface SlotCardProps {
  slot: SlotView
  onEdit: () => void
  onPause: () => void
  onReopen: () => void
  onRemove: () => void
}

const stateLabels: Record<SlotState, string> = {
  waiting: 'Waiting for its planning batch',
  'catch-up': 'Checked hourly for a late match',
  assigned: 'Plan assigned',
  unfilled: 'No plan was found',
  paused: 'Paused',
  closed: 'Closed',
}

const stateStyles: Record<SlotState, string> = {
  waiting: 'bg-amber-100 text-amber-900',
  'catch-up': 'bg-amber-100 text-amber-900',
  assigned: 'bg-emerald-100 text-emerald-900',
  unfilled: 'bg-stone-200 text-stone-700',
  paused: 'bg-stone-200 text-stone-700',
  closed: 'bg-stone-200 text-stone-700',
}

export function SlotCard({ slot, onEdit, onPause, onReopen, onRemove }: SlotCardProps) {
  const isEditable = slot.status === 'pending' || slot.status === 'paused'
  return (
    <article className="rounded-xl border border-stone-200 bg-white p-4">
      <p className="text-sm font-medium">
        {formatTimeRange(slot.startsAt, slot.endsAt, slot.timezone)}
      </p>
      <p
        className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs ${stateStyles[slot.state]}`}
      >
        {stateLabels[slot.state]}
      </p>
      {slot.state === 'waiting' && (
        <p className="mt-1 text-xs text-stone-500">
          Planning runs {formatDateTime(slot.expectedBatchAt, slot.timezone)}.
        </p>
      )}
      {slot.state === 'assigned' && slot.assignedEventId && (
        <Link href={`/plans/${slot.assignedEventId}`} className="mt-1 block text-sm underline">
          See the plan
        </Link>
      )}
      {isEditable && (
        <div className="mt-3 flex gap-3 text-sm">
          <button type="button" onClick={onEdit} className="underline">
            Edit
          </button>
          {slot.status === 'pending' && (
            <button type="button" onClick={onPause} className="underline">
              Pause
            </button>
          )}
          {slot.status === 'paused' && (
            <button type="button" onClick={onReopen} className="underline">
              Reopen
            </button>
          )}
          <button type="button" onClick={onRemove} className="text-red-700 underline">
            Remove
          </button>
        </div>
      )}
    </article>
  )
}
