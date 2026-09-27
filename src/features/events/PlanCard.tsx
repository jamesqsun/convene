'use client'

import { formatDateTime } from '@/lib/format'
import { avatarColorFor, gradientFor, initialOf } from './cardStyle'
import type { Plan } from './read'

const maxAvatars = 4

function PinIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 shrink-0">
      <path
        fillRule="evenodd"
        d="M10 2a6 6 0 0 0-6 6c0 4.2 6 10 6 10s6-5.8 6-10a6 6 0 0 0-6-6Zm0 8.25A2.25 2.25 0 1 1 10 5.75a2.25 2.25 0 0 1 0 4.5Z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 shrink-0">
      <path d="M6 2a1 1 0 0 1 1 1v1h6V3a1 1 0 1 1 2 0v1h.5A2.5 2.5 0 0 1 18 6.5v9A2.5 2.5 0 0 1 15.5 18h-11A2.5 2.5 0 0 1 2 15.5v-9A2.5 2.5 0 0 1 4.5 4H5V3a1 1 0 0 1 1-1Zm10 6H4v7.5c0 .28.22.5.5.5h11a.5.5 0 0 0 .5-.5V8Z" />
    </svg>
  )
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path d="M14 6a2 2 0 1 0-1.94-2.5l-5.4 2.7a2 2 0 1 0 0 3.6l5.4 2.7a2 2 0 1 0 .7-1.34l-5.4-2.7a2 2 0 0 0 0-.92l5.4-2.7c.34.21.74.33 1.17.33.11 0 .3-.05.47-.19Z" />
    </svg>
  )
}

async function shareEvent(plan: Plan) {
  const text = `${plan.activity.name} · ${formatDateTime(plan.startsAt, plan.timezone)} · ${plan.venue.name}`
  if (typeof navigator !== 'undefined' && navigator.share) {
    await navigator.share({ title: plan.activity.name, text }).catch(() => undefined)
  } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
    await navigator.clipboard.writeText(text).catch(() => undefined)
  }
}

function AvatarStack({ plan }: { plan: Plan }) {
  const shown = plan.participants.slice(0, maxAvatars)
  const overflow = plan.participants.length - shown.length
  return (
    <div className="flex -space-x-2">
      {shown.map((person) => (
        <span
          key={person.userId}
          title={person.name}
          className={`flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-xs font-semibold text-white ${avatarColorFor(person.userId)}`}
        >
          {initialOf(person.name)}
        </span>
      ))}
      {overflow > 0 && (
        <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-stone-700 text-xs font-semibold text-white">
          +{overflow}
        </span>
      )}
    </div>
  )
}

export interface PlanCardProps {
  plan: Plan
  onOpen: () => void
}

/** A colorful summary card; tapping it opens the detail popup rather than navigating away. */
export function PlanCard({ plan, onOpen }: PlanCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen()
        }
      }}
      aria-label={`${plan.activity.name}, ${formatDateTime(plan.startsAt, plan.timezone)}, ${plan.venue.name}`}
      className={`cursor-pointer space-y-3 rounded-2xl bg-gradient-to-br p-4 ${gradientFor(plan.activity.id)}`}
    >
      <div className="flex items-center justify-between gap-2 text-xs font-medium text-stone-700">
        <span className="flex min-w-0 items-center gap-1">
          <PinIcon />
          <span className="truncate">{plan.venue.name}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <CalendarIcon />
          {formatDateTime(plan.startsAt, plan.timezone)}
        </span>
      </div>
      <p className="line-clamp-2 text-base font-semibold text-stone-900">{plan.activity.name}</p>
      {plan.status === 'cancelled' && (
        <span className="inline-block rounded-full bg-white/70 px-2 py-0.5 text-xs text-stone-700">
          Cancelled
        </span>
      )}
      <div className="flex items-center justify-between">
        <AvatarStack plan={plan} />
        <div className="flex items-center gap-1">
          {plan.calendarStatus === 'created' && (
            <span
              title="In your Google Calendar"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/70 text-emerald-700"
            >
              <CalendarIcon />
            </span>
          )}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              void shareEvent(plan)
            }}
            aria-label="Share this plan"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/70 text-stone-700 hover:bg-white"
          >
            <ShareIcon />
          </button>
        </div>
      </div>
    </div>
  )
}
