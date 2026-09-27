'use client'

import { useState } from 'react'
import { useAppState } from '@/features/state/useAppState'
import { ApiError, apiFetch } from '@/lib/client-api'
import { formatTimeRange, zoneLabel } from '@/lib/format'
import type { Plan } from './read'

function VenueBlock({ plan }: { plan: Plan }) {
  const query = [plan.venue.name, plan.venue.address].filter(Boolean).join(', ')
  const params = new URLSearchParams({ api: '1', query })
  if (plan.venue.provider === 'google_places' && plan.venue.placeId) {
    params.set('query_place_id', plan.venue.placeId)
  }
  const mapsUrl = `https://www.google.com/maps/search/?${params}`
  return (
    <div>
      <h2 className="eyebrow font-sans">Where</h2>
      <p className="mt-1 font-extrabold">{plan.venue.name}</p>
      <p className="text-sm text-ink/85">{plan.venue.address}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        {plan.venue.provider === 'fictional' && (
          <span className="pill pill-sage">Fictional demo venue</span>
        )}
        {!plan.venue.hoursVerified && <span className="pill pill-muted">Hours unverified</span>}
        {plan.venue.provider !== 'fictional' && (
          <a href={mapsUrl} target="_blank" rel="noreferrer" className="link">
            Open in Maps
          </a>
        )}
      </div>
    </div>
  )
}

function People({ plan }: { plan: Plan }) {
  return (
    <div>
      <h2 className="eyebrow font-sans">Who</h2>
      <ul className="mt-2 space-y-2">
        {plan.participants.map((person) => (
          <li key={person.userId} className="card p-3">
            <p className="font-extrabold">{person.name}</p>
            {person.interests.length > 0 && <p className="hint">{person.interests.join(' · ')}</p>}
            {person.phone && (
              <a href={`tel:${person.phone}`} className="link text-sm">
                {person.phone}
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

export interface PlanDetailProps {
  plan: Plan
  /** Called after a successful withdrawal, before the state refresh removes the plan. */
  onWithdrawn?: (message: string) => void
}

export function PlanDetail({ plan, onWithdrawn }: PlanDetailProps) {
  const { refresh } = useAppState()
  const [message, setMessage] = useState<string | null>(null)

  async function withdraw() {
    if (
      !window.confirm(
        'Leave this plan? The others keep it if at least two remain, and your availability for it closes.',
      )
    )
      return
    try {
      const result = await apiFetch<{ result: string }>(`/api/plans/${plan.eventId}/withdraw`, {
        method: 'POST',
      })
      const outcome =
        result.result === 'event_cancelled'
          ? 'You left, and the plan was cancelled because only one person remained.'
          : 'You left the plan.'
      setMessage(outcome)
      onWithdrawn?.(outcome)
      await refresh()
    } catch (caught) {
      setMessage(caught instanceof ApiError ? caught.message : 'Could not withdraw')
    }
  }

  return (
    <section className="@container space-y-5">
      <header>
        <h1 className="text-[26px] leading-tight md:text-[34px]">{plan.activity.name}</h1>
        <p className="mt-1 text-sm font-semibold text-ink/85">
          {formatTimeRange(plan.startsAt, plan.endsAt, plan.timezone)}{' '}
          {zoneLabel(plan.startsAt, plan.timezone)}
        </p>
        {plan.status === 'cancelled' && <p className="pill pill-muted mt-2 mr-2">Cancelled</p>}
        {plan.calendarStatus === 'created' && (
          <p className="pill pill-sage mt-2">In your Google Calendar</p>
        )}
      </header>
      <p className="text-[15px] text-muted">{plan.explanation}</p>
      <div className="grid gap-5 @lg:grid-cols-2">
        <VenueBlock plan={plan} />
        <People plan={plan} />
      </div>
      {message && <p className="text-sm font-semibold text-ink/85">{message}</p>}
      {plan.canWithdraw && (
        <button type="button" onClick={() => void withdraw()} className="btn btn-danger w-full">
          Withdraw from this plan
        </button>
      )}
    </section>
  )
}
