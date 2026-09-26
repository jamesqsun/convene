import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AppStateContext, type AppStateValue, useAppState } from './useAppState'

function Probe() {
  const { state, isLoading } = useAppState()
  return <span>{isLoading ? 'loading' : (state?.profile.name ?? 'nobody')}</span>
}

export function fakeAppState(overrides: Partial<AppStateValue> = {}): AppStateValue {
  return {
    state: null,
    error: null,
    isLoading: false,
    announcedPlanIds: [],
    refresh: async () => undefined,
    dismissAnnouncements: () => undefined,
    ...overrides,
  }
}

describe('useAppState', () => {
  it('reads from the nearest provider and refuses to run without one', () => {
    const html = renderToStaticMarkup(
      <AppStateContext.Provider value={fakeAppState({ isLoading: true })}>
        <Probe />
      </AppStateContext.Provider>,
    )
    expect(html).toContain('loading')
    expect(() => renderToStaticMarkup(<Probe />)).toThrow(/inside AppStateProvider/)
  })
})
