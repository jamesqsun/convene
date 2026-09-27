import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { zonedTime } from '@/lib/time'
import { WeekGrid } from './WeekGrid'
import { cellKey } from './week-grid'
import type { WeekView } from './weeks'

const tz = 'America/Toronto'
const weekStart = '2026-09-28'
const week: WeekView = {
  weekStart,
  status: 'auto',
  copiedFrom: '2026-09-21',
  timeZone: tz,
  dayStarts: Array.from({ length: 8 }, (_, day) => zonedTime(tz, weekStart) + day * 86_400_000),
  slots: [],
  busy: [
    {
      startsAt: zonedTime(tz, '2026-09-30', 9, 30),
      endsAt: zonedTime(tz, '2026-09-30', 10, 30),
      summary: 'Standup',
      calendarId: 'work',
      isAllDay: false,
    },
  ],
  events: [
    {
      eventId: 'e',
      activityName: 'Coffee',
      startsAt: zonedTime(tz, '2026-10-02', 18),
      endsAt: zonedTime(tz, '2026-10-02', 19),
    },
  ],
  plannableAfter: zonedTime(tz, '2026-09-30', 12),
}

describe('WeekGrid', () => {
  it('renders seven days with busy and event overlays and locks cells that cannot be planned', () => {
    const html = renderToStaticMarkup(
      <WeekGrid week={week} selected={new Set([cellKey(4, 24)])} onChange={() => undefined} />,
    )
    expect(html).toContain('Standup')
    expect(html).toContain('Coffee')
    expect(html).toContain('aria-pressed="true"')
    expect((html.match(/data-cell=/g) ?? []).length).toBe(7 * 36)
    // Monday 06:00 is long before the 48-hour cutoff, so it is disabled.
    expect(html).toMatch(/data-cell="0:0"[^>]*disabled=""/)
    expect(html).not.toMatch(/data-cell="5:24"[^>]*disabled=""/)
  })

  it('shows busy time as hatched grey even inside the too-soon-to-plan cutoff', () => {
    const html = renderToStaticMarkup(
      <WeekGrid week={week} selected={new Set()} onChange={() => undefined} />,
    )
    // The "Standup" busy block (Wed 09:30) falls before plannableAfter, so it is disabled
    // for painting, but must still render as busy (bg-line, hatched) rather than plain locked (bg-linen).
    expect(html).toMatch(/data-cell="2:7"[^>]*disabled=""[^>]*bg-line\b/)
  })
})
