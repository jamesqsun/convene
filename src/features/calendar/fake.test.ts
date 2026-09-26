import { describe, expect, it } from 'vitest'
import { localClockOf, localDateOf, zonedTime } from '@/lib/time'
import { fakeBusyBlocks, fakeCalendarProvider } from './fake'

const tz = 'America/Toronto'

describe('fakeCalendarProvider', () => {
  it('connects instantly and lists two fictional calendars', async () => {
    const provider = fakeCalendarProvider()
    expect(provider.authorizationUrl('http://localhost/cb', 's t')).toBe(
      'http://localhost/cb?code=fake-code&state=s%20t',
    )
    expect((await provider.exchangeCode('fake-code', 'cb')).email).toBe('you@gmail.demo')
    expect((await provider.listCalendars('x')).map((c) => c.id)).toEqual(['primary', 'work'])
  })

  it('produces a weekly busy pattern inside the requested range', () => {
    // Monday 2026-09-28 through Sunday 2026-10-04.
    const from = zonedTime(tz, '2026-09-28')
    const to = zonedTime(tz, '2026-10-05')
    const blocks = fakeBusyBlocks(['primary', 'work'], { from, to }, tz)
    const work = blocks.filter((b) => b.calendarId === 'work')
    expect(work).toHaveLength(5)
    expect(localClockOf(tz, work[0]!.startsAt)).toBe('09:30')
    const brunch = blocks.find((b) => b.summary === 'Brunch with Sam')!
    expect(localDateOf(tz, brunch.startsAt)).toBe('2026-10-03')
    expect(fakeBusyBlocks(['primary'], { from, to: from + 3_600_000 }, tz)).toEqual([])
  })

  it('records written and deleted events', async () => {
    const provider = fakeCalendarProvider()
    const id = await provider.createEvent('x', 'convene-demo', {
      summary: 'Coffee',
      description: '',
      location: '',
      startsAt: 0,
      endsAt: 1,
      timeZone: tz,
    })
    await provider.deleteEvent('x', 'convene-demo', id)
    expect(provider.writtenEvents).toHaveLength(1)
    expect(provider.deletedEvents).toEqual([id])
  })
})
