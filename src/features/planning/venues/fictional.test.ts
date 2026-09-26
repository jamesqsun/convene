import { describe, expect, it } from 'vitest'
import { fictionalVenueProvider } from './fictional'

describe('fictionalVenueProvider', () => {
  it('returns clearly labelled fictional venues near the bias point with unverified hours', async () => {
    const results = await fictionalVenueProvider().search({
      textQuery: 'coffee shop in Toronto',
      biasLat: 43.65,
      biasLng: -79.38,
      radiusMeters: 1000,
      maxResults: 5,
    })
    expect(results).toHaveLength(2)
    expect(results[0]).toMatchObject({
      name: '(Demo) Coffee shop on Main',
      address: '12 Main St, Toronto (fictional)',
      source: 'fictional',
      openingHours: null,
      isOperational: true,
    })
    expect(Math.abs(results[0]!.lat - 43.65)).toBeLessThan(0.01)
    expect(results.map((r) => r.providerId)).toEqual([
      'demo:coffee-shop-on-main',
      'demo:coffee-shop-corner',
    ])
  })

  it('honours maxResults and is deterministic', async () => {
    const provider = fictionalVenueProvider()
    const query = {
      textQuery: 'park in Vancouver',
      biasLat: 49.28,
      biasLng: -123.12,
      radiusMeters: 1000,
      maxResults: 1,
    }
    expect(await provider.search(query)).toHaveLength(1)
    expect(await provider.search(query)).toEqual(await provider.search(query))
  })
})
