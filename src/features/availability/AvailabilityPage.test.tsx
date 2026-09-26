import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AppStateContext } from '@/features/state/useAppState'
import { fakeAppState } from '@/features/state/useAppState.test'
import { AvailabilityPage } from './AvailabilityPage'

describe('AvailabilityPage', () => {
  it('renders nothing on the server before state and the week are known', () => {
    const state = {
      serverNow: 0,
      mode: 'demo' as const,
      profile: {
        userId: 'u',
        name: 'Maya',
        onboardingStep: 'done',
        timezone: 'America/Toronto',
        cityLabel: 'Toronto',
        memoryCount: 0,
        isRepeatingAvailability: true,
      },
      slots: [],
      plans: [],
      hangouts: [],
    }
    const html = renderToStaticMarkup(
      <AppStateContext.Provider value={fakeAppState({ state })}>
        <AvailabilityPage />
      </AppStateContext.Provider>,
    )
    expect(html).toBe('')
  })
})
