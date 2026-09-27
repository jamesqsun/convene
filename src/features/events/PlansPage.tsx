'use client'

import { useState } from 'react'
import { PastHangoutsSection } from '@/features/feedback/PastHangoutsSection'
import { Modal } from '@/features/shell/Modal'
import { useAppState } from '@/features/state/useAppState'
import { PlanCard } from './PlanCard'
import { PlanDetail } from './PlanDetail'

export function PlansPage() {
  const { state } = useAppState()
  const [openEventId, setOpenEventId] = useState<string | null>(null)
  if (!state) return null
  const openPlan = state.plans.find((plan) => plan.eventId === openEventId) ?? null

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
          <PlanCard key={plan.eventId} plan={plan} onOpen={() => setOpenEventId(plan.eventId)} />
        ))}
      </div>
      <PastHangoutsSection hangouts={state.hangouts} />
      <Modal
        isOpen={openPlan !== null}
        onClose={() => setOpenEventId(null)}
        ariaLabel="Plan details"
      >
        {openPlan && <PlanDetail plan={openPlan} onWithdrawn={() => setOpenEventId(null)} />}
      </Modal>
    </section>
  )
}
