'use client'

import Link from 'next/link'
import { formatDateTime } from '@/lib/format'
import type { Plan } from './read'

export function PlanCard({ plan }: { plan: Plan }) {
  return (
    <Link
      href={`/plans/${plan.eventId}`}
      className="block rounded-xl border border-stone-200 bg-white p-4"
    >
      <p className="font-semibold">{plan.activity.name}</p>
      <p className="text-sm text-stone-700">
        {formatDateTime(plan.startsAt, plan.timezone)} · {plan.venue.name}
      </p>
      <p className="mt-1 text-xs text-stone-500">
        {plan.status === 'cancelled' ? 'Cancelled' : `${plan.participants.length} people`}
      </p>
    </Link>
  )
}
