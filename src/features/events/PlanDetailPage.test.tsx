import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AppStateContext } from '@/features/state/useAppState'
import { fakeAppState } from '@/features/state/useAppState.test'
import { samplePlan } from './PlanCard.test'
import { PlanDetailPage } from './PlanDetailPage'

describe('PlanDetailPage', () => {
  it('renders the plan when present and a fallback otherwise', () => {
    const state = {
      serverNow: 0,
      mode: 'demo' as const,
      profile: {
        userId: 'u',
        name: 'Maya',
        onboardingStep: 'done',
        timezone: null,
        cityLabel: null,
        memoryCount: 0,
      },
      slots: [],
      plans: [samplePlan],
      hangouts: [],
    }
    const render = (eventId: string) =>
      renderToStaticMarkup(
        <AppStateContext.Provider value={fakeAppState({ state })}>
          <PlanDetailPage eventId={eventId} />
        </AppStateContext.Provider>,
      )
    expect(render('evt')).toContain('Coffee and conversation')
    expect(render('missing')).toContain('not available to you')
  })
})
