'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/client-api'
import { PastHangoutsSection } from '@/features/feedback/PastHangoutsSection'
import type { Hangout, Plan } from './read'
import { useAppState } from '@/features/state/useAppState'
import { PlanDetail } from './PlanDetail'

/** Finds the plan in the polled state; the state read already enforces participant access. */
export function PlanDetailPage({ eventId }: { eventId: string }) {
  const { state } = useAppState()
  const [notice, setNotice] = useState<string | null>(null)
  const [fetched, setFetched] = useState<{
    eventId: string
    plan?: Plan
    hangout?: Hangout
    error?: string
  } | null>(null)
  const plan = state?.plans.find((candidate) => candidate.eventId === eventId)
  const hangout = state?.hangouts.find((candidate) => candidate.eventId === eventId)
  useEffect(() => {
    if (!state || plan || hangout) return
    let active = true
    apiFetch<{ plan?: Plan; hangout?: Hangout }>(`/api/plans/${encodeURIComponent(eventId)}`)
      .then((result) => {
        if (active) setFetched({ eventId, ...result })
      })
      .catch(() => {
        if (active)
          setFetched({
            eventId,
            error: 'This plan is not available to you, or it has been removed.',
          })
      })
    return () => {
      active = false
    }
  }, [eventId, state, plan, hangout])
  const detail = fetched?.eventId === eventId ? fetched : null
  const past = hangout ?? detail?.hangout
  if (past)
    return (
      <section className="space-y-4">
        <Link href="/plans" className="text-sm underline">
          Back to plans
        </Link>
        <PastHangoutsSection hangouts={[past]} />
      </section>
    )
  if (!state || (!plan && !detail)) return <p className="text-sm text-stone-600">Loading plan…</p>
  const current = plan ?? detail?.plan
  if (notice) {
    return (
      <section>
        <p className="text-sm text-stone-700">{notice}</p>
        <Link href="/plans" className="mt-2 block text-sm underline">
          Back to plans
        </Link>
      </section>
    )
  }
  if (!current) {
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
  return <PlanDetail plan={current} onWithdrawn={setNotice} />
}
