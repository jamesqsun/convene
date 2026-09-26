import { describe, expect, it, vi } from 'vitest'
import { hour, zonedTime } from '@/lib/time'
import { maxActivitiesTried, planVenueAndTime } from './plan-venue'
import type { VenueProvider, VenueResult } from './provider'

const tz = 'America/Toronto'
const start = zonedTime(tz, '2026-10-03', 18)
const window = { start, end: start + 2 * hour }
const context = { timeZone: tz, city: { name: 'Toronto', lat: 43.65, lng: -79.38 } }

const venue = (name: string, overrides: Partial<VenueResult> = {}): VenueResult => ({
  providerId: name,
  name,
  address: 'somewhere',
  lat: 43.65,
  lng: -79.38,
  isOperational: true,
  openingHours: null,
  source: 'fictional',
  ...overrides,
})

function providerReturning(
  results: (VenueResult[] | Error)[],
): VenueProvider & { search: ReturnType<typeof vi.fn> } {
  const queue = [...results]
  const search = vi.fn(async () => {
    const next = queue.shift() ?? []
    if (next instanceof Error) throw next
    return next
  })
  return { kind: 'fictional', search }
}

const ranked = [
  { activityId: 'coffee', durationMinutes: 60 },
  { activityId: 'bowling', durationMinutes: 90 },
  { activityId: 'park_walk', durationMinutes: 60 },
  { activityId: 'museum_visit', durationMinutes: 90 },
]

describe('planVenueAndTime', () => {
  it('uses the first activity with an operational venue that fits', async () => {
    const provider = providerReturning([[venue('closed', { isOperational: false }), venue('open')]])
    const plan = await planVenueAndTime(ranked, window, provider, context)
    expect(plan).toMatchObject({
      activity: { id: 'coffee' },
      durationMinutes: 60,
      venue: { name: 'open' },
      start,
      isHoursVerified: false,
    })
    expect(provider.search).toHaveBeenCalledTimes(1)
  })

  it('falls through to the next activity when a search is empty or throws', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const provider = providerReturning([[], new Error('quota'), [venue('park')]])
    const plan = await planVenueAndTime(ranked, window, provider, context)
    expect(plan?.activity.id).toBe('park_walk')
    expect(provider.search).toHaveBeenCalledTimes(3)
  })

  it('gives up after the activity bound and only tries two venues per search', async () => {
    const closed = venue('never', {
      openingHours: [{ openDay: 1, openMinutes: 0, closeDay: 1, closeMinutes: 60 }],
    })
    const provider = providerReturning([
      [closed, closed, venue('third-would-fit')],
      [closed],
      [closed],
      [venue('unreached')],
    ])
    expect(await planVenueAndTime(ranked, window, provider, context)).toBeNull()
    expect(provider.search).toHaveBeenCalledTimes(maxActivitiesTried)
  })

  it('skips unknown activity ids', async () => {
    const provider = providerReturning([[venue('v')]])
    const plan = await planVenueAndTime(
      [{ activityId: 'nope', durationMinutes: 60 }, ranked[0]!],
      window,
      provider,
      context,
    )
    expect(plan?.activity.id).toBe('coffee')
    expect(provider.search).toHaveBeenCalledTimes(1)
  })
})
