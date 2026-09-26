import type { Activity } from '../activities/catalog'

/**
 * Venue lookup contract. Two implementations exist: Google Places (New) for connected mode and an
 * explicitly fictional provider for demo mode or when no key is configured.
 */

/** One opening period in local time. A null close means open around the clock from `openDay`. */
export interface OpeningPeriod {
  /** 0 = Sunday. */
  openDay: number
  openMinutes: number
  closeDay: number | null
  closeMinutes: number | null
}

export interface VenueResult {
  providerId: string
  name: string
  address: string
  lat: number
  lng: number
  isOperational: boolean
  /** Null when the provider had no hours; the event is then labelled "hours unverified". */
  openingHours: OpeningPeriod[] | null
  source: 'google_places' | 'fictional'
}

export interface VenueQuery {
  textQuery: string
  biasLat: number
  biasLng: number
  radiusMeters: number
  maxResults: number
}

export interface VenueProvider {
  readonly kind: 'google_places' | 'fictional'
  search(query: VenueQuery): Promise<VenueResult[]>
}

export interface CityContext {
  name: string
  lat: number
  lng: number
}

export const defaultSearchRadiusMeters = 15_000
export const defaultMaxResults = 5

export function venueQueryFor(activity: Activity, city: CityContext): VenueQuery {
  return {
    textQuery: `${activity.placesQuery} in ${city.name}`,
    biasLat: city.lat,
    biasLng: city.lng,
    radiusMeters: defaultSearchRadiusMeters,
    maxResults: defaultMaxResults,
  }
}
