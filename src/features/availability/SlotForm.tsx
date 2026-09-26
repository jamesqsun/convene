'use client'

import { useState } from 'react'
import { ApiError, apiFetch } from '@/lib/client-api'
import { localClockOf, localDateOf } from '@/lib/time'
import type { Slot } from './store'

export interface SlotFormProps {
  timezone: string
  existing?: Slot
  onSaved: () => Promise<void>
  onCancel?: () => void
}

const inputClass = 'mt-1 w-full rounded-lg border border-stone-300 px-3 py-2'

/** Date plus start and end clock times in the city zone. Nothing else is asked. */
export function SlotForm({ timezone, existing, onSaved, onCancel }: SlotFormProps) {
  const [date, setDate] = useState(existing ? localDateOf(timezone, existing.startsAt) : '')
  const [startTime, setStartTime] = useState(
    existing ? localClockOf(timezone, existing.startsAt) : '18:00',
  )
  const [endTime, setEndTime] = useState(
    existing ? localClockOf(timezone, existing.endsAt) : '21:00',
  )
  const [error, setError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)

  async function submit() {
    setIsBusy(true)
    setError(null)
    try {
      const body = { date, startTime, endTime }
      if (existing) await apiFetch(`/api/availability/${existing.id}`, { method: 'PATCH', body })
      else await apiFetch('/api/availability', { method: 'POST', body })
      await onSaved()
      if (!existing) setDate('')
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not save')
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <form
      className="rounded-xl border border-stone-200 bg-white p-4"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <p className="text-sm font-medium">
        {existing ? 'Edit availability' : 'Add availability'}{' '}
        <span className="font-normal text-stone-500">({timezone})</span>
      </p>
      <label className="mt-2 block text-sm">
        Date
        <input
          required
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={inputClass}
        />
      </label>
      <div className="mt-2 flex gap-2">
        <label className="block w-1/2 text-sm">
          From
          <input
            required
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block w-1/2 text-sm">
          Until
          <input
            required
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className={inputClass}
          />
        </label>
      </div>
      <p className="mt-2 text-xs text-stone-500">
        At least one hour. Plans are made at midnight two days ahead, so windows must end more than
        49 hours from now.
      </p>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={isBusy}
          className="rounded-lg bg-stone-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {existing ? 'Save' : 'Add'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-stone-300 px-4 py-2 text-sm"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
