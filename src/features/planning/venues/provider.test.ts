import { describe, expect, it } from 'vitest'
import { activityById } from '../activities/catalog'
import { defaultMaxResults, defaultSearchRadiusMeters, venueQueryFor } from './provider'

describe('venueQueryFor', () => {
  it('builds a city-scoped text query biased to the city centre', () => {
    const query = venueQueryFor(activityById('coffee')!, {
      name: 'Toronto',
      lat: 43.65,
      lng: -79.38,
    })
    expect(query).toEqual({
      textQuery: 'coffee shop in Toronto',
      biasLat: 43.65,
      biasLng: -79.38,
      radiusMeters: defaultSearchRadiusMeters,
      maxResults: defaultMaxResults,
    })
  })
})
