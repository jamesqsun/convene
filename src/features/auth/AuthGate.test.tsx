import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { fakeAppState } from '@/features/state/useAppState.test'
import { AppStateContext } from '@/features/state/useAppState'
import type { ClientState } from '@/features/state/useAppState'
import { AuthGate } from './AuthGate'

const state = (onboardingStep: string): ClientState => ({
  serverNow: 0,
  mode: 'demo',
  profile: {
    userId: 'u',
    name: 'Maya',
    onboardingStep,
    timezone: 'America/Toronto',
    cityLabel: 'Toronto',
    memoryCount: 0,
  },
  slots: [],
  plans: [],
  hangouts: [],
})

function render(value: Parameters<typeof fakeAppState>[0]) {
  return renderToStaticMarkup(
    <AppStateContext.Provider value={fakeAppState(value)}>
      <AuthGate>
        <p>secret content</p>
      </AuthGate>
    </AppStateContext.Provider>,
  )
}

describe('AuthGate', () => {
  it('shows children only for a loaded, onboarded profile', () => {
    expect(render({ isLoading: true })).toContain('Loading')
    expect(render({ state: state('city') })).not.toContain('secret content')
    expect(render({ state: state('done') })).toContain('secret content')
  })
})
