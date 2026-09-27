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
  waiting: 'pill-sage',
  'catch-up': 'pill-sage',
  assigned: 'bg-sage-deep text-white',
  unfilled: 'pill-muted',
  paused: 'pill-muted',
  closed: 'pill-muted',
}

export function SlotCard({ slot, onEdit, onPause, onReopen, onRemove }: SlotCardProps) {
  const isEditable = slot.status === 'pending' || slot.status === 'paused'
  return (
    <article className="card">
      <p className="text-[15px] font-extrabold text-ink">
        {formatTimeRange(slot.startsAt, slot.endsAt, slot.timezone)}
      </p>
      <p className={`pill mt-2 ${stateStyles[slot.state]}`}>{stateLabels[slot.state]}</p>
      {slot.state === 'waiting' && (
        <p className="hint mt-1.5">
          Planning runs {formatDateTime(slot.expectedBatchAt, slot.timezone)}.
        </p>
      )}
      {slot.state === 'assigned' && slot.assignedEventId && (
        <Link href={`/plans/${slot.assignedEventId}`} className="link mt-2 block text-sm">
          See the plan
        </Link>
      )}
      {isEditable && (
        <div className="mt-3 flex gap-4 text-[13px] font-bold">
          <button
            type="button"
            onClick={onEdit}
            className="text-sage-deep underline decoration-sage/40 underline-offset-2 hover:decoration-sage"
          >
            Edit
          </button>
          {slot.status === 'pending' && (
            <button
              type="button"
              onClick={onPause}
              className="text-sage-deep underline decoration-sage/40 underline-offset-2 hover:decoration-sage"
            >
              Pause
            </button>
          )}
          {slot.status === 'paused' && (
            <button
              type="button"
              onClick={onReopen}
              className="text-sage-deep underline decoration-sage/40 underline-offset-2 hover:decoration-sage"
            >
              Reopen
            </button>
          )}
          <button
            type="button"
            onClick={onRemove}
            className="text-clay-deep underline decoration-clay-deep/40 underline-offset-2 hover:decoration-clay-deep"
          >
            Remove
          </button>
        </div>
      )}
    </article>
  )
}
