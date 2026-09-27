'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useAppState } from '@/features/state/useAppState'
import { PlanDetail } from './PlanDetail'

/** Finds the plan in the polled state; the state read already enforces participant access. */
export function PlanDetailPage({ eventId }: { eventId: string }) {
  const { state } = useAppState()
  const [notice, setNotice] = useState<string | null>(null)
  const plan = state?.plans.find((candidate) => candidate.eventId === eventId)
  if (notice) {
    return (
      <section>
        <p className="text-sm font-semibold text-ink/85">{notice}</p>
        <Link href="/plans" className="link mt-2 inline-block text-sm">
          Back to plans
        </Link>
      </section>
    )
  }
  if (!plan) {
    return (
      <section>
        <p className="text-sm text-muted">
          This plan is not available to you, or it has been removed.
        </p>
        <Link href="/plans" className="link mt-2 inline-block text-sm">
          Back to plans
        </Link>
      </section>
    )
  }
  return <PlanDetail plan={plan} onWithdrawn={setNotice} />
}
