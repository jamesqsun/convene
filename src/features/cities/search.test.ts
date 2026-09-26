import { describe, expect, it } from 'vitest'
import { maxCityMatches, resolveCity, searchCities } from './search'

describe('searchCities', () => {
  it('returns labelled, disambiguated matches with time zones, largest first', () => {
    const portlands = searchCities('portland')
    expect(portlands.map((c) => c.label)).toEqual([
      'Portland, Oregon, United States of America',
      'Portland, Maine, United States of America',
      'Portland, Victoria, Australia',
    ])
    expect(portlands[0]!.timezone).toBe('America/Los_Angeles')
    expect(portlands[0]!.key).toBe('us:oregon:portland')
  })

  it('prefers prefix matches, caps results, and ignores short queries', () => {
    const results = searchCities('tor')
    expect(results[0]!.name).toBe('Toronto')
    expect(results.length).toBeLessThanOrEqual(maxCityMatches)
    expect(searchCities('t')).toEqual([])
    expect(searchCities('  ')).toEqual([])
  })

  it('resolves a key back to the same city and rejects unknown keys', () => {
    const toronto = searchCities('toronto')[0]!
    expect(resolveCity(toronto.key)).toEqual(toronto)
    expect(resolveCity('xx:nowhere:nothing')).toBeNull()
  })
})
