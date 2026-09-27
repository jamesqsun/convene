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
      <section className="card">
        <p className="text-[15px] font-extrabold text-ink">Overlay your Google Calendar</p>
        <p className="mt-1 text-sm text-muted">
          Busy times are subtracted from your availability, and assigned hangouts are added to a
          Convene calendar in your account.
        </p>
        <a href="/api/calendar/google/connect" className="btn btn-primary mt-3">
          Connect Google Calendar
        </a>
        {message && <p className="mt-2 text-sm font-semibold text-ink/85">{message}</p>}
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
    <section className="card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[15px] font-extrabold text-ink">Google Calendar</p>
          <p className="text-sm break-all text-muted">{status.connection.accountEmail}</p>
          <p className="hint mt-0.5">
            {status.connection.lastSyncedAt
              ? `Synced ${formatDaysAgo(status.connection.lastSyncedAt, Date.now())}`
              : 'Not synced yet'}
            {status.connection.lastError ? ` · ${status.connection.lastError}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void act(() => apiFetch('/api/calendar/sync', { method: 'POST' }))}
          className="btn btn-outline btn-sm shrink-0"
        >
          Sync now
        </button>
      </div>
      <p className="eyebrow mt-4">Count as busy</p>
      <ul className="mt-2 space-y-1.5">
        {status.calendars.map((calendar) => (
          <li key={calendar.id}>
            <label className="flex items-center gap-2 text-sm font-semibold text-ink">
              <input
                type="checkbox"
                checked={calendar.isSelected}
                onChange={() => toggle(calendar.id)}
                className="size-4 accent-sage-deep"
              />
              <span
                className="inline-block size-3 rounded-full"
                style={{ background: calendar.color ?? 'var(--color-muted)' }}
              />
              {calendar.summary}
              {calendar.isPrimary && <span className="pill pill-muted">primary</span>}
            </label>
          </li>
        ))}
      </ul>
      <p className="hint mt-3">
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
        className="mt-2 text-sm font-bold text-clay-deep underline decoration-clay-deep/40 underline-offset-2 hover:decoration-clay-deep"
      >
        Disconnect
      </button>
      {message && <p className="mt-2 text-sm font-semibold text-ink/85">{message}</p>}
    </section>
  )
}
