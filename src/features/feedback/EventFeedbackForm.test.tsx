import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { AppStateContext } from '@/features/state/useAppState'
import { fakeAppState } from '@/features/state/useAppState.test'
import { EventFeedbackForm } from './EventFeedbackForm'
import type { EventFeedback } from './event'

const render = (saved?: EventFeedback) =>
  renderToStaticMarkup(
    <AppStateContext.Provider value={fakeAppState()}>
      <EventFeedbackForm eventId="event" saved={saved} />
    </AppStateContext.Provider>,
  )
it('shows a private feedback form, saved state, and retry for failed memory updates', () => {
  expect(render()).toContain('Submit event feedback')
  expect(render()).toContain('This is private')
  expect(render({ text: 'Quiet please', memoriesUpdated: false })).toContain(
    'updating in the background',
  )
  expect(render({ text: 'Quiet please', memoriesUpdated: false })).not.toContain(
    'Retry memory update',
  )
  expect(
    render({ text: 'Quiet please', memoriesUpdated: false, memoryUpdateFailed: true }),
  ).toContain('Retry memory update')
  const saved = render({ text: 'Quiet please', memoriesUpdated: true })
  expect(saved).toContain('Quiet please')
  expect(saved).toContain('Your memories are up to date')
  expect(saved).not.toContain('Submit event feedback')
})
