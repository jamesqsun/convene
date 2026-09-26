import { describe, expect, it } from 'vitest'
import { zonedTime } from '@/lib/time'
import { formatLocalStart, notificationPayload } from './payloads'

const event = {
  id: 'evt-1',
  activityName: 'Coffee and conversation',
  startsAt: zonedTime('America/Toronto', '2026-10-03', 18),
  timezone: 'America/Toronto',
  venueName: '(Demo) Cafe',
}

describe('notificationPayload', () => {
  it('formats the start in the event time zone', () => {
    expect(formatLocalStart(event)).toBe('Sat, Oct 3, 6:00 PM')
  })

  it('builds each type with a link to the plan and no personal data', () => {
    expect(notificationPayload('assignment', event)).toEqual({
      title: 'Plan assigned: Coffee and conversation',
      body: 'Sat, Oct 3, 6:00 PM at (Demo) Cafe',
      url: '/plans/evt-1',
      tag: 'assignment:evt-1',
    })
    expect(notificationPayload('participant_left', event, 2).body).toBe(
      '2 people are still going to coffee and conversation on Sat, Oct 3, 6:00 PM.',
    )
    expect(notificationPayload('cancellation', event).title).toBe('Plan cancelled')
  })
})
