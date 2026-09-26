'use client'

import { useAppState } from '@/features/state/useAppState'
import { PlanCard } from './PlanCard'

export function PlansPage() {
  const { state } = useAppState()
  if (!state) return null
  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Plans</h1>
      {state.plans.length === 0 && (
        <p className="text-sm text-stone-500">
          Nothing assigned yet. Add availability and Convene will plan something.
        </p>
      )}
      <div className="space-y-3">
        {state.plans.map((plan) => (
          <PlanCard key={plan.eventId} plan={plan} />
        ))}
      </div>
    </section>
  )
}
