import { minute } from '@/lib/time'
import { type Activity, activityById } from '../activities/catalog'
import type { RankedActivity } from '../activities/ranking'
import { type CityContext, type VenueProvider, type VenueResult, venueQueryFor } from './provider'
import { chooseEventInterval } from './time-selection'

/**
 * Turns a ranked activity list into a concrete venue and time, with bounded retries: at most three
 * activities, one provider search each, and at most two operational venues per search. A provider
 * error counts as "no venues". Returns null when nothing fits, leaving the group unfilled.
 */

export const maxActivitiesTried = 3
export const maxVenuesPerActivity = 2

export interface VenuePlan {
  activity: Activity
  durationMinutes: number
  venue: VenueResult
  start: number
  end: number
  isHoursVerified: boolean
}

export interface PlanningContext {
  timeZone: string
  city: CityContext
}

async function searchSafely(
  provider: VenueProvider,
  activity: Activity,
  city: CityContext,
): Promise<VenueResult[]> {
  try {
    return await provider.search(venueQueryFor(activity, city))
  } catch (error) {
    console.warn(`[venues] search failed for ${activity.id}:`, error)
    return []
  }
}

function fitVenue(
  ranked: RankedActivity,
  activity: Activity,
  venues: readonly VenueResult[],
  window: { start: number; end: number },
  timeZone: string,
): VenuePlan | null {
  const durationMs = ranked.durationMinutes * minute
  for (const venue of venues
    .filter((candidate) => candidate.isOperational)
    .slice(0, maxVenuesPerActivity)) {
    const interval = chooseEventInterval(window, durationMs, venue.openingHours, timeZone)
    if (!interval) continue
    return { activity, durationMinutes: ranked.durationMinutes, venue, ...interval }
  }
  return null
}

export async function planVenueAndTime(
  ranked: readonly RankedActivity[],
  window: { start: number; end: number },
  provider: VenueProvider,
  context: PlanningContext,
): Promise<VenuePlan | null> {
  for (const item of ranked.slice(0, maxActivitiesTried)) {
    const activity = activityById(item.activityId)
    if (!activity) continue
    const venues = await searchSafely(provider, activity, context.city)
    const plan = fitVenue(item, activity, venues, window, context.timeZone)
    if (plan) return plan
  }
  return null
}
