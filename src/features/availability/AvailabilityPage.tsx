'use client'

import { useState } from 'react'
import { useAppState } from '@/features/state/useAppState'
import { ApiError, apiFetch } from '@/lib/client-api'
import { SlotCard, type SlotView } from './SlotCard'
import { SlotForm } from './SlotForm'

export function AvailabilityPage() {
  const { state, refresh } = useAppState()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  if (!state) return null
  const timezone = state.profile.timezone ?? 'UTC'
  const slots = state.slots as SlotView[]

  async function act(path: string, method: 'POST' | 'DELETE', confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return
    setMessage(null)
    try {
      await apiFetch(path, { method })
      await refresh()
    } catch (caught) {
      setMessage(caught instanceof ApiError ? caught.message : 'Something went wrong')
    }
  }

  async function runPlanningNow() {
    setMessage('Running the planning batch…')
    try {
      const summary = await apiFetch<{ batches: { groups: { status: string }[] }[] }>(
        '/api/demo/run-jobs',
        { method: 'POST' },
      )
      const committed = summary.batches
        .flatMap((b) => b.groups)
        .filter((g) => g.status === 'committed').length
      setMessage(
        committed > 0
          ? `Planning ran: ${committed} plan(s) assigned.`
          : 'Planning ran: nothing new to assign right now.',
      )
      await refresh()
    } catch (caught) {
      setMessage(caught instanceof ApiError ? caught.message : 'Could not run planning')
    }
  }

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Availability</h1>
      <p className="text-sm text-stone-600">
        Tell Convene when you are free. It picks the people, activity, place, and exact time.
      </p>
      <SlotForm timezone={timezone} onSaved={refresh} />
      {state.mode === 'demo' && (
        <button
          type="button"
          onClick={() => void runPlanningNow()}
          className="w-full rounded-lg border border-emerald-700 px-4 py-2 text-sm text-emerald-800"
        >
          Run planning now (demo)
        </button>
      )}
      {message && <p className="text-sm text-stone-700">{message}</p>}
      <div className="space-y-3">
        {slots.length === 0 && <p className="text-sm text-stone-500">No availability yet.</p>}
        {slots.map((slot) =>
          editingId === slot.id ? (
            <SlotForm
              key={slot.id}
              timezone={timezone}
              existing={slot}
              onSaved={async () => {
                setEditingId(null)
                await refresh()
              }}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <SlotCard
              key={slot.id}
              slot={slot}
              onEdit={() => setEditingId(slot.id)}
              onPause={() => void act(`/api/availability/${slot.id}/pause`, 'POST')}
              onReopen={() => void act(`/api/availability/${slot.id}/reopen`, 'POST')}
              onRemove={() =>
                void act(`/api/availability/${slot.id}`, 'DELETE', 'Remove this availability?')
              }
            />
          ),
        )}
      </div>
    </section>
  )
}
