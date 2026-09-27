import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AppStateContext } from '@/features/state/useAppState'
import { fakeAppState } from '@/features/state/useAppState.test'
import { samplePlan } from './PlanCard.test'
import { PlansPage } from './PlansPage'

describe('PlansPage', () => {
  it('lists plans and past hangouts from state, with the detail popup closed by default', () => {
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
      hangouts: [
        {
          eventId: 'past',
          endedAt: 0,
          timezone: 'America/Toronto',
          activityName: 'Board games',
          venueName: '(Demo) Cafe',
          people: [
            { userId: 'b', name: 'Ben', interests: [], myAnswer: null, isMutualFriend: false },
          ],
        },
      ],
    }
    const html = renderToStaticMarkup(
      <AppStateContext.Provider value={fakeAppState({ state })}>
        <PlansPage />
      </AppStateContext.Provider>,
    )
    expect(html).toContain('Coffee and conversation')
    expect(html).toContain('Past hangouts')
    expect(html).toContain('Board games')
    // The popup only renders once a card is opened, which needs a click; it is closed here.
    expect(html).not.toContain('role="dialog"')
  })
})
