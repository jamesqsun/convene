import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Hangout } from '@/features/events/read'
import { AppStateContext } from '@/features/state/useAppState'
import { fakeAppState } from '@/features/state/useAppState.test'
import { PastHangoutsSection } from './PastHangoutsSection'

function hangout(id: string): Hangout {
  return {
    eventId: id,
    endedAt: 0,
    timezone: 'America/Toronto',
    activityName: `Activity ${id}`,
    venueName: '(Demo) Cafe',
    people: [{ userId: 'b', name: 'Ben', interests: [], myAnswer: null, isMutualFriend: false }],
  }
}

function render(hangouts: Hangout[]) {
  return renderToStaticMarkup(
    <AppStateContext.Provider value={fakeAppState()}>
      <PastHangoutsSection hangouts={hangouts} />
    </AppStateContext.Provider>,
  )
}

describe('PastHangoutsSection', () => {
  it('renders nothing when there are no completed hangouts', () => {
    expect(render([])).toBe('')
  })

  it('lists completed hangouts with per-person questions', () => {
    const html = render([hangout('a')])
    expect(html).toContain('Activity a')
    expect(html).toContain('Ben')
    expect(html).toContain('>Yes<')
  })

  it('caps the initial list and offers to show the rest', () => {
    const hangouts = Array.from({ length: 5 }, (_, i) => hangout(String(i)))
    const html = render(hangouts)
    expect(html).toContain('Activity 0')
    expect(html).toContain('Activity 2')
    expect(html).not.toContain('Activity 3')
    expect(html).toContain('Show 2 more')
  })
})
