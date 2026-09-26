'use client'

import Link from 'next/link'
import { useAppState } from '@/features/state/useAppState'
import { PlanDetail } from './PlanDetail'

/** Finds the plan in the polled state; the state read already enforces participant access. */
export function PlanDetailPage({ eventId }: { eventId: string }) {
  const { state } = useAppState()
  const plan = state?.plans.find((candidate) => candidate.eventId === eventId)
  if (!plan) {
    return (
      <section>
        <p className="text-sm text-stone-600">
          This plan is not available to you, or it has been removed.
        </p>
        <Link href="/plans" className="mt-2 block text-sm underline">
          Back to plans
        </Link>
      </section>
    )
  }
  return <PlanDetail plan={plan} />
}
