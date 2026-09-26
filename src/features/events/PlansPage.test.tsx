import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AppStateContext } from '@/features/state/useAppState'
import { fakeAppState } from '@/features/state/useAppState.test'
import { samplePlan } from './PlanCard.test'
import { PlansPage } from './PlansPage'

describe('PlansPage', () => {
  it('lists plans from state', () => {
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
        isRepeatingAvailability: true,
      },
      slots: [],
      plans: [samplePlan],
      hangouts: [],
    }
    const html = renderToStaticMarkup(
      <AppStateContext.Provider value={fakeAppState({ state })}>
        <PlansPage />
      </AppStateContext.Provider>,
    )
    expect(html).toContain('Coffee and conversation')
  })
})
