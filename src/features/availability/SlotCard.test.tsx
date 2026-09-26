import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { zonedTime } from '@/lib/time'
import { SlotCard, type SlotView } from './SlotCard'

const tz = 'America/Toronto'
const base: SlotView = {
  id: 's',
  startsAt: zonedTime(tz, '2026-10-03', 18),
  endsAt: zonedTime(tz, '2026-10-03', 21),
  timezone: tz,
  status: 'pending',
  revision: 1,
  assignedEventId: null,
  state: 'waiting',
  expectedBatchAt: zonedTime(tz, '2026-10-01'),
}
const noop = () => undefined

describe('SlotCard', () => {
  it('shows the window, the state, and the expected batch time', () => {
    const html = renderToStaticMarkup(
      <SlotCard slot={base} onEdit={noop} onPause={noop} onReopen={noop} onRemove={noop} />,
    )
    expect(html).toContain('Saturday, October 3, 6:00 PM to 9:00 PM')
    expect(html).toContain('Waiting for its planning batch')
    expect(html).toContain('Planning runs Thu, Oct 1, 12:00 AM')
    expect(html).toContain('>Pause<')
  })

  it('links assigned slots to their plan and hides editing', () => {
    const html = renderToStaticMarkup(
      <SlotCard
        slot={{ ...base, status: 'filled', state: 'assigned', assignedEventId: 'evt' }}
        onEdit={noop}
        onPause={noop}
        onReopen={noop}
        onRemove={noop}
      />,
    )
    expect(html).toContain('href="/plans/evt"')
    expect(html).not.toContain('>Edit<')
  })
})
