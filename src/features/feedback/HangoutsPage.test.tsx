import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AppStateContext } from '@/features/state/useAppState'
import { fakeAppState } from '@/features/state/useAppState.test'
import { HangoutsPage } from './HangoutsPage'

describe('HangoutsPage', () => {
  it('lists completed hangouts with per-person questions', () => {
    const hangout = {
      eventId: 'e',
      endedAt: 0,
      timezone: 'America/Toronto',
      activityName: 'Coffee',
      venueName: '(Demo) Cafe',
      people: [{ userId: 'b', name: 'Ben', interests: [], myAnswer: null, isMutualFriend: false }],
    }
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
      plans: [],
      hangouts: [hangout],
    }
    const html = renderToStaticMarkup(
      <AppStateContext.Provider value={fakeAppState({ state })}>
        <HangoutsPage />
      </AppStateContext.Provider>,
    )
    expect(html).toContain('Coffee')
    expect(html).toContain('Ben')
    expect(html).toContain('>Yes<')
  })
})
