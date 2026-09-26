import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AppStateContext } from '@/features/state/useAppState'
import { fakeAppState } from '@/features/state/useAppState.test'
import { ProfilePage } from './ProfilePage'

describe('ProfilePage', () => {
  it('renders the owner heading and links', () => {
    const state = {
      serverNow: 0,
      mode: 'demo' as const,
      profile: {
        userId: 'u',
        name: 'Maya',
        onboardingStep: 'done',
        timezone: null,
        cityLabel: 'Toronto',
        memoryCount: 0,
      },
      slots: [],
      plans: [],
      hangouts: [],
    }
    const html = renderToStaticMarkup(
      <AppStateContext.Provider value={fakeAppState({ state })}>
        <ProfilePage />
      </AppStateContext.Provider>,
    )
    expect(html).toContain('Maya')
    expect(html).toContain('href="/profile/answers"')
    expect(html).toContain('Sign out')
  })
})
