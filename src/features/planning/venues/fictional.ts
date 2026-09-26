import type { VenueProvider, VenueQuery, VenueResult } from './provider'

/**
 * The demo venue provider. Every result is clearly labelled fictional, carries no opening hours
 * (so plans show "hours unverified"), and is deterministic for a given query.
 */
export function fictionalVenueProvider(): VenueProvider {
  return {
    kind: 'fictional',
    async search(query: VenueQuery): Promise<VenueResult[]> {
      const base = query.textQuery.replace(/\s+in\s+.+$/, '')
      const label = base.charAt(0).toUpperCase() + base.slice(1)
      const cityName = query.textQuery.includes(' in ')
        ? query.textQuery.slice(query.textQuery.lastIndexOf(' in ') + 4)
        : 'Demo City'
      return [
        fictionalVenue(`${label} on Main`, `12 Main St, ${cityName} (fictional)`, query, 0.004),
        fictionalVenue(`${label} Corner`, `48 Elm Ave, ${cityName} (fictional)`, query, -0.006),
      ].slice(0, query.maxResults)
    },
  }
}

function fictionalVenue(
  name: string,
  address: string,
  query: VenueQuery,
  offset: number,
): VenueResult {
  return {
    providerId: `demo:${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name: `(Demo) ${name}`,
    address,
    lat: query.biasLat + offset,
    lng: query.biasLng - offset,
    isOperational: true,
    openingHours: null,
    source: 'fictional',
  }
}
