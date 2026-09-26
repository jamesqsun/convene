import { describe, expect, it, vi } from 'vitest'
import { googlePlacesProvider, placesEndpoint, placesFieldMask } from './google-places'

const query = {
  textQuery: 'coffee shop in Toronto',
  biasLat: 43.65,
  biasLng: -79.38,
  radiusMeters: 15000,
  maxResults: 5,
}

function fetchReturning(status: number, body: unknown) {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  )
}

describe('googlePlacesProvider', () => {
  it('posts a text search with the field mask and maps places to venues', async () => {
    const fetchImpl = fetchReturning(200, {
      places: [
        {
          id: 'p1',
          displayName: { text: 'Good Beans' },
          formattedAddress: '1 King St W, Toronto',
          location: { latitude: 43.6, longitude: -79.4 },
          businessStatus: 'OPERATIONAL',
          regularOpeningHours: {
            periods: [
              { open: { day: 1, hour: 8, minute: 30 }, close: { day: 1, hour: 18, minute: 0 } },
            ],
          },
        },
        {
          id: 'p2',
          displayName: { text: 'Shut' },
          location: { latitude: 1, longitude: 2 },
          businessStatus: 'CLOSED_PERMANENTLY',
        },
        { id: 'p3', displayName: { text: 'No location' } },
      ],
    })
    const venues = await googlePlacesProvider('key', fetchImpl as never).search(query)
    expect(venues).toEqual([
      {
        providerId: 'p1',
        name: 'Good Beans',
        address: '1 King St W, Toronto',
        lat: 43.6,
        lng: -79.4,
        isOperational: true,
        openingHours: [{ openDay: 1, openMinutes: 510, closeDay: 1, closeMinutes: 1080 }],
        source: 'google_places',
      },
      {
        providerId: 'p2',
        name: 'Shut',
        address: '',
        lat: 1,
        lng: 2,
        isOperational: false,
        openingHours: null,
        source: 'google_places',
      },
    ])
    const [url, init] = fetchImpl.mock.calls[0]! as unknown as [string, RequestInit]
    expect(url).toBe(placesEndpoint)
    expect(new Headers(init.headers).get('X-Goog-FieldMask')).toBe(placesFieldMask)
    expect(new Headers(init.headers).get('X-Goog-Api-Key')).toBe('key')
    expect(JSON.parse(init.body as string)).toMatchObject({
      textQuery: 'coffee shop in Toronto',
      maxResultCount: 5,
    })
  })

  it('throws on HTTP errors and malformed bodies', async () => {
    await expect(
      googlePlacesProvider('key', fetchReturning(403, {}) as never).search(query),
    ).rejects.toThrow(/HTTP 403/)
    await expect(
      googlePlacesProvider(
        'key',
        fetchReturning(200, { places: [{ nope: true }] }) as never,
      ).search(query),
    ).rejects.toThrow()
    expect(
      await googlePlacesProvider('key', fetchReturning(200, {}) as never).search(query),
    ).toEqual([])
  })
})
