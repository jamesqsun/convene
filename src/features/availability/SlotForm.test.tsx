import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { zonedTime } from '@/lib/time'
import { SlotForm } from './SlotForm'

describe('SlotForm', () => {
  it('pre-fills an existing slot in the city zone and asks for nothing but times', () => {
    const tz = 'America/Toronto'
    const existing = {
      id: 's',
      startsAt: zonedTime(tz, '2026-10-03', 18),
      endsAt: zonedTime(tz, '2026-10-03', 21),
      timezone: tz,
      status: 'pending' as const,
      revision: 1,
      assignedEventId: null,
    }
    const html = renderToStaticMarkup(
      <SlotForm timezone={tz} existing={existing} onSaved={async () => undefined} />,
    )
    expect(html).toContain('value="2026-10-03"')
    expect(html).toContain('value="18:00"')
    expect(html).toContain('value="21:00"')
    expect(html.toLowerCase()).not.toMatch(/activity|budget|group size|platform/)
  })
})
