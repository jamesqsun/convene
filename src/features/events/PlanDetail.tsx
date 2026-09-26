'use client'

import { useState } from 'react'
import { useAppState } from '@/features/state/useAppState'
import { ApiError, apiFetch } from '@/lib/client-api'
import { formatTimeRange, zoneLabel } from '@/lib/format'
import type { Plan } from './read'

function VenueBlock({ plan }: { plan: Plan }) {
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${plan.venue.lat},${plan.venue.lng}`
  return (
    <div>
      <h2 className="text-sm font-semibold text-stone-600">Where</h2>
      <p className="font-medium">{plan.venue.name}</p>
      <p className="text-sm text-stone-700">{plan.venue.address}</p>
      <div className="mt-1 flex flex-wrap gap-2 text-xs">
        {plan.venue.provider === 'fictional' && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900">
            Fictional demo venue
          </span>
        )}
        {!plan.venue.hoursVerified && (
          <span className="rounded-full bg-stone-200 px-2 py-0.5 text-stone-700">
            Hours unverified
          </span>
        )}
        <a href={mapsUrl} target="_blank" rel="noreferrer" className="underline">
          Open in Maps
        </a>
      </div>
    </div>
  )
}

function People({ plan }: { plan: Plan }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-stone-600">Who</h2>
      <ul className="mt-1 space-y-2">
        {plan.participants.map((person) => (
          <li key={person.userId} className="rounded-lg bg-white p-3">
            <p className="font-medium">{person.name}</p>
            {person.interests.length > 0 && (
              <p className="text-xs text-stone-500">{person.interests.join(' · ')}</p>
            )}
            {person.phone && (
              <a href={`tel:${person.phone}`} className="text-sm underline">
                {person.phone}
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function PlanDetail({ plan }: { plan: Plan }) {
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
      setMessage(
        result.result === 'event_cancelled'
          ? 'You left, and the plan was cancelled because only one person remained.'
          : 'You left the plan.',
      )
      await refresh()
    } catch (caught) {
      setMessage(caught instanceof ApiError ? caught.message : 'Could not withdraw')
    }
  }

  return (
    <section className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold">{plan.activity.name}</h1>
        <p className="text-sm text-stone-700">
          {formatTimeRange(plan.startsAt, plan.endsAt, plan.timezone)}{' '}
          {zoneLabel(plan.startsAt, plan.timezone)}
        </p>
        {plan.status === 'cancelled' && (
          <p className="mt-1 inline-block rounded-full bg-stone-200 px-2 py-0.5 text-xs">
            Cancelled
          </p>
        )}
      </header>
      <p className="text-sm text-stone-700">{plan.explanation}</p>
      <VenueBlock plan={plan} />
      <People plan={plan} />
      {message && <p className="text-sm text-stone-700">{message}</p>}
      {plan.canWithdraw && (
        <button
          type="button"
          onClick={() => void withdraw()}
          className="w-full rounded-lg border border-red-700 px-4 py-2 text-sm text-red-700"
        >
          Withdraw from this plan
        </button>
      )}
    </section>
  )
}
