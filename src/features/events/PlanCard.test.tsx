import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { zonedTime } from '@/lib/time'
import { PlanCard } from './PlanCard'
import type { Plan } from './read'

export const samplePlan: Plan = {
  eventId: 'evt',
  status: 'scheduled',
  startsAt: zonedTime('America/Toronto', '2026-10-03', 18),
  endsAt: zonedTime('America/Toronto', '2026-10-03', 19),
  timezone: 'America/Toronto',
  activity: { id: 'coffee', name: 'Coffee and conversation', durationMinutes: 60 },
  venue: {
    provider: 'fictional',
    name: '(Demo) Cafe',
    address: '12 Main St',
    lat: 43.7,
    lng: -79.4,
    hoursVerified: false,
  },
  explanation: 'You share an interest in coffee.',
  participants: [
    { userId: 'a', name: 'Ann', interests: ['coffee'], phone: '+14165550001' },
    { userId: 'b', name: 'Ben', interests: ['art'], phone: '+14165550002' },
  ],
  canWithdraw: true,
}

describe('PlanCard', () => {
  it('links to the plan with activity, time, and venue', () => {
    const html = renderToStaticMarkup(<PlanCard plan={samplePlan} />)
    expect(html).toContain('href="/plans/evt"')
    expect(html).toContain('Sat, Oct 3, 6:00 PM')
    expect(html).toContain('2 people')
    expect(
      renderToStaticMarkup(<PlanCard plan={{ ...samplePlan, status: 'cancelled' }} />),
    ).toContain('Cancelled')
  })
})
