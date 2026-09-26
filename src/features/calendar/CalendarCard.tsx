'use client'

import { useEffect, useState } from 'react'
import { ApiError, apiFetch } from '@/lib/client-api'
import { formatDaysAgo } from '@/lib/format'

interface CalendarStatus {
  isAvailable: boolean
  connection: { accountEmail: string; lastSyncedAt: number | null; lastError: string | null } | null
  calendars: {
    id: string
    summary: string
    isPrimary: boolean
    isSelected: boolean
    color: string | null
  }[]
}

export interface CalendarCardProps {
  /** Set from the ?calendar= query after the OAuth round trip. */
  notice?: 'connected' | 'error' | null
  onChanged: () => Promise<void>
}

/** Connect a Google account, pick which calendars count as busy, resync, or disconnect. */
export function CalendarCard({ notice = null, onChanged }: CalendarCardProps) {
  const [status, setStatus] = useState<CalendarStatus | null>(null)
  const [message, setMessage] = useState<string | null>(
    notice === 'connected'
      ? 'Calendar connected.'
      : notice === 'error'
        ? 'Could not connect the calendar. Try again.'
        : null,
  )

  const load = () =>
    apiFetch<CalendarStatus>('/api/calendar')
      .then(setStatus)
      .catch(() => setStatus(null))

  useEffect(() => {
    void load()
  }, [])

  async function act(run: () => Promise<unknown>) {
    setMessage(null)
    try {
      await run()
      await Promise.all([load(), onChanged()])
    } catch (caught) {
      setMessage(caught instanceof ApiError ? caught.message : 'Something went wrong')
    }
  }

  if (!status || !status.isAvailable) return null
  if (!status.connection) {
    return (
      <section className="rounded-xl border border-stone-200 bg-white p-4">
        <p className="font-semibold">Overlay your Google Calendar</p>
        <p className="mt-1 text-sm text-stone-600">
          Busy times are subtracted from your availability, and assigned hangouts are added to a
          Convene calendar in your account.
        </p>
        <a
          href="/api/calendar/google/connect"
          className="mt-3 inline-block rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white"
        >
          Connect Google Calendar
        </a>
        {message && <p className="mt-2 text-sm text-stone-700">{message}</p>}
      </section>
    )
  }
  const toggle = (id: string) => {
    const selected = status.calendars
      .filter((c) => (c.id === id ? !c.isSelected : c.isSelected))
      .map((c) => c.id)
    void act(() => apiFetch('/api/calendar/calendars', { method: 'POST', body: { selected } }))
  }
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">Google Calendar</p>
          <p className="text-sm text-stone-600">{status.connection.accountEmail}</p>
          <p className="text-xs text-stone-500">
            {status.connection.lastSyncedAt
              ? `Synced ${formatDaysAgo(status.connection.lastSyncedAt, Date.now())}`
              : 'Not synced yet'}
            {status.connection.lastError ? ` · ${status.connection.lastError}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void act(() => apiFetch('/api/calendar/sync', { method: 'POST' }))}
          className="rounded-lg border border-stone-300 px-3 py-1 text-sm"
        >
          Sync now
        </button>
      </div>
      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-stone-500">
        Count as busy
      </p>
      <ul className="mt-1 space-y-1">
        {status.calendars.map((calendar) => (
          <li key={calendar.id}>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={calendar.isSelected}
                onChange={() => toggle(calendar.id)}
              />
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ background: calendar.color ?? '#a8a29e' }}
              />
              {calendar.summary}
              {calendar.isPrimary && <span className="text-xs text-stone-400">primary</span>}
            </label>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-stone-500">
        Assigned hangouts appear in a "Convene" calendar in this account and are removed if you
        withdraw.
      </p>
      <button
        type="button"
        onClick={() => {
          if (
            window.confirm('Disconnect Google Calendar? Busy times will no longer be considered.')
          )
            void act(() => apiFetch('/api/calendar', { method: 'DELETE' }))
        }}
        className="mt-2 text-sm text-red-700 underline"
      >
        Disconnect
      </button>
      {message && <p className="mt-2 text-sm text-stone-700">{message}</p>}
    </section>
  )
}
