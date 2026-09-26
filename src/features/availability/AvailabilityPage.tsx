'use client'

import { useEffect, useState } from 'react'
import { CalendarCard } from '@/features/calendar/CalendarCard'
import { useAppState } from '@/features/state/useAppState'
import { ApiError, apiFetch } from '@/lib/client-api'
import { minOverlapMs } from '@/features/planning/types'
import { addLocalDays, advanceAssignmentMs } from '@/lib/time'
import { SlotCard, type SlotView } from './SlotCard'
import { WeekGrid } from './WeekGrid'
import {
  isSameSelection,
  selectionFromRanges,
  weekStartOf,
  windowsFromSelection,
} from './week-grid'
import type { WeekView } from './weeks'

function weekStatusText(week: WeekView, isRepeating: boolean): string {
  if (week.status === 'confirmed') return 'Set by you.'
  if (week.status === 'auto')
    return `Repeated from the week of ${week.copiedFrom}. Edit anything and it becomes yours.`
  return isRepeating
    ? 'Not set yet: your most recent week will be repeated automatically when planning runs.'
    : 'Not set yet.'
}

export function AvailabilityPage() {
  const { state, refresh } = useAppState()
  const [weekStart, setWeekStart] = useState<string | null>(null)
  const [week, setWeek] = useState<WeekView | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const timezone = state?.profile.timezone ?? 'UTC'
  const calendarNotice =
    typeof window === 'undefined'
      ? null
      : (new URLSearchParams(window.location.search).get('calendar') as
          'connected' | 'error' | null)

  useEffect(() => {
    // Open on the first week that still has plannable time rather than a mostly locked one.
    if (state && weekStart === null) {
      setWeekStart(weekStartOf(timezone, state.serverNow + advanceAssignmentMs + minOverlapMs))
    }
  }, [state, timezone, weekStart])

  async function loadWeek(start: string) {
    const body = await apiFetch<{ week: WeekView }>(`/api/availability/weeks/${start}`)
    setWeek(body.week)
    setSelected(
      selectionFromRanges(
        body.week.slots
          .filter((s) => s.status === 'pending' || s.status === 'paused')
          .map((s) => ({ start: s.startsAt, end: s.endsAt })),
        start,
        body.week.timeZone,
      ),
    )
  }

  useEffect(() => {
    if (weekStart) loadWeek(weekStart).catch(() => setMessage('Could not load this week'))
  }, [weekStart])

  if (!state || !weekStart) return null
  const baseline = week
    ? selectionFromRanges(
        week.slots
          .filter((s) => s.status === 'pending' || s.status === 'paused')
          .map((s) => ({ start: s.startsAt, end: s.endsAt })),
        weekStart,
        week.timeZone,
      )
    : new Set<string>()
  const isDirty = !isSameSelection(selected, baseline)

  async function save() {
    if (!weekStart) return
    setIsSaving(true)
    setMessage(null)
    try {
      const body = await apiFetch<{
        result: { created: number; removed: number; skippedTooSoon: number }
      }>(`/api/availability/weeks/${weekStart}`, {
        method: 'PUT',
        body: { windows: windowsFromSelection(selected) },
      })
      const notes = [`${body.result.created} added`, `${body.result.removed} removed`]
      if (body.result.skippedTooSoon > 0)
        notes.push(`${body.result.skippedTooSoon} skipped (too soon to plan)`)
      setMessage(`Saved: ${notes.join(', ')}.`)
      await Promise.all([loadWeek(weekStart), refresh()])
    } catch (caught) {
      setMessage(caught instanceof ApiError ? caught.message : 'Could not save')
    } finally {
      setIsSaving(false)
    }
  }

  async function setRepeating(isRepeatingAvailability: boolean) {
    await apiFetch('/api/profile', { method: 'PATCH', body: { isRepeatingAvailability } }).catch(
      () => undefined,
    )
    await refresh()
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
      await Promise.all([loadWeek(weekStart!), refresh()])
    } catch (caught) {
      setMessage(caught instanceof ApiError ? caught.message : 'Could not run planning')
    }
  }

  const slotActions = (slot: SlotView) => ({
    onEdit: () => setMessage('Edit windows in the grid above, then save.'),
    onPause: () =>
      void apiFetch(`/api/availability/${slot.id}/pause`, { method: 'POST' }).then(() =>
        Promise.all([loadWeek(weekStart!), refresh()]),
      ),
    onReopen: () =>
      void apiFetch(`/api/availability/${slot.id}/reopen`, { method: 'POST' })
        .then(() => Promise.all([loadWeek(weekStart!), refresh()]))
        .catch((e: unknown) => setMessage(e instanceof ApiError ? e.message : 'Could not reopen')),
    onRemove: () => {
      if (window.confirm('Remove this window?'))
        void apiFetch(`/api/availability/${slot.id}`, { method: 'DELETE' }).then(() =>
          Promise.all([loadWeek(weekStart!), refresh()]),
        )
    },
  })

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Your week</h1>
      <p className="text-sm text-stone-600">
        Paint the times you are free. Convene picks the people, activity, place, and exact time
        inside them, and works around anything on your calendar.
      </p>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setWeekStart(addLocalDays(weekStart, -7))}
          className="rounded-lg border border-stone-300 px-3 py-1 text-sm"
        >
          ← Previous
        </button>
        <p className="text-sm font-medium">
          Week of {weekStart} <span className="text-stone-500">({timezone})</span>
        </p>
        <button
          type="button"
          onClick={() => setWeekStart(addLocalDays(weekStart, 7))}
          className="rounded-lg border border-stone-300 px-3 py-1 text-sm"
        >
          Next →
        </button>
      </div>
      {week ? (
        <WeekGrid week={week} selected={selected} onChange={setSelected} />
      ) : (
        <p className="text-sm text-stone-500">Loading…</p>
      )}
      <ul className="flex flex-wrap gap-3 text-xs text-stone-600">
        <li>
          <span className="mr-1 inline-block h-3 w-3 rounded bg-stone-900 align-middle" />
          Free
        </li>
        <li>
          <span className="mr-1 inline-block h-3 w-3 rounded bg-amber-100 align-middle" />
          Busy on your calendar
        </li>
        <li>
          <span className="mr-1 inline-block h-3 w-3 rounded bg-emerald-600 align-middle" />
          Assigned hangout
        </li>
        <li>
          <span className="mr-1 inline-block h-3 w-3 rounded bg-stone-100 align-middle" />
          Too soon to plan
        </li>
      </ul>
      {week && (
        <p className="text-sm text-stone-600">
          {weekStatusText(week, state.profile.isRepeatingAvailability)}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={!isDirty || isSaving}
          className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Save this week
        </button>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={state.profile.isRepeatingAvailability}
            onChange={(e) => void setRepeating(e.target.checked)}
          />
          Repeat my latest week automatically
        </label>
      </div>
      {message && <p className="text-sm text-stone-700">{message}</p>}
      <CalendarCard notice={calendarNotice} onChanged={() => loadWeek(weekStart)} />
      {state.mode === 'demo' && (
        <button
          type="button"
          onClick={() => void runPlanningNow()}
          className="w-full rounded-lg border border-emerald-700 px-4 py-2 text-sm text-emerald-800"
        >
          Run planning now (demo)
        </button>
      )}
      <h2 className="font-semibold">Upcoming windows</h2>
      <div className="space-y-3">
        {state.slots.length === 0 && <p className="text-sm text-stone-500">No availability yet.</p>}
        {(state.slots as SlotView[]).map((slot) => (
          <SlotCard key={slot.id} slot={slot} {...slotActions(slot)} />
        ))}
      </div>
    </section>
  )
}
