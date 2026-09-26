import { z } from 'zod'
import type { OpeningPeriod, VenueProvider, VenueQuery, VenueResult } from './provider'

/**
 * Google Places API (New) text search. Only the fields the planner needs are requested. Hours come
 * back as-is from the provider; missing hours become null so the plan is labelled unverified.
 */

export const placesEndpoint = 'https://places.googleapis.com/v1/places:searchText'
export const placesFieldMask =
  'places.id,places.displayName,places.formattedAddress,places.location,places.regularOpeningHours,places.businessStatus'

const pointSchema = z.object({
  day: z.number().int().min(0).max(6),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
})

const placeSchema = z.object({
  id: z.string(),
  displayName: z.object({ text: z.string() }).optional(),
  formattedAddress: z.string().optional(),
  location: z.object({ latitude: z.number(), longitude: z.number() }).optional(),
  businessStatus: z.string().optional(),
  regularOpeningHours: z
    .object({
      periods: z.array(z.object({ open: pointSchema, close: pointSchema.optional() })).optional(),
    })
    .optional(),
})

const responseSchema = z.object({ places: z.array(placeSchema).optional() })

type Place = z.infer<typeof placeSchema>

function periodsOf(place: Place): OpeningPeriod[] | null {
  const periods = place.regularOpeningHours?.periods
  if (!periods || periods.length === 0) return null
  return periods.map((period) => ({
    openDay: period.open.day,
    openMinutes: period.open.hour * 60 + period.open.minute,
    closeDay: period.close?.day ?? null,
    closeMinutes: period.close ? period.close.hour * 60 + period.close.minute : null,
  }))
}

function toVenue(place: Place): VenueResult | null {
  if (!place.location) return null
  return {
    providerId: place.id,
    name: place.displayName?.text ?? 'Unnamed venue',
    address: place.formattedAddress ?? '',
    lat: place.location.latitude,
    lng: place.location.longitude,
    isOperational: (place.businessStatus ?? 'OPERATIONAL') === 'OPERATIONAL',
    openingHours: periodsOf(place),
    source: 'google_places',
  }
}

export function googlePlacesProvider(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): VenueProvider {
  return {
    kind: 'google_places',
    async search(query: VenueQuery): Promise<VenueResult[]> {
      const response = await fetchImpl(placesEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': placesFieldMask,
        },
        body: JSON.stringify({
          textQuery: query.textQuery,
          maxResultCount: query.maxResults,
          locationBias: {
            circle: {
              center: { latitude: query.biasLat, longitude: query.biasLng },
              radius: query.radiusMeters,
            },
          },
        }),
      })
      if (!response.ok) throw new Error(`Places search failed with HTTP ${response.status}`)
      const parsed = responseSchema.parse(await response.json())
      return (parsed.places ?? [])
        .map(toVenue)
        .filter((venue): venue is VenueResult => venue !== null)
    },
  }
}
