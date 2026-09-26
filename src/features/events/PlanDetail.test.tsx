import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AppStateContext } from '@/features/state/useAppState'
import { fakeAppState } from '@/features/state/useAppState.test'
import { samplePlan } from './PlanCard.test'
import { PlanDetail } from './PlanDetail'

function render(plan: typeof samplePlan) {
  return renderToStaticMarkup(
    <AppStateContext.Provider value={fakeAppState()}>
      <PlanDetail plan={plan} />
    </AppStateContext.Provider>,
  )
}

describe('PlanDetail', () => {
  it('shows people with phones, venue badges, explanation, and the withdraw control', () => {
    const html = render(samplePlan)
    expect(html).toContain('tel:+14165550001')
    expect(html).toContain('Fictional demo venue')
    expect(html).toContain('Hours unverified')
    expect(html).toContain('You share an interest in coffee.')
    expect(html).toContain('Withdraw from this plan')
    expect(render({ ...samplePlan, calendarStatus: 'created' })).toContain(
      'In your Google Calendar',
    )
  })

  it('hides withdraw once it is no longer possible and shows cancellation', () => {
    const html = render({
      ...samplePlan,
      status: 'cancelled',
      canWithdraw: false,
      participants: samplePlan.participants.map((p) => ({ ...p, phone: null })),
    })
    expect(html).not.toContain('Withdraw from this plan')
    expect(html).toContain('Cancelled')
    expect(html).not.toContain('tel:')
  })
})
