import { cityMapping } from 'city-timezones'
import { isValidTimeZone } from '@/lib/time'

/**
 * The city picker's data: the city-timezones dataset, filtered to rows with a usable IANA zone.
 * City names are ambiguous ("Portland" is three cities in two zones), so the user always picks
 * from labelled matches and the profile stores the chosen key. Server-side only: the dataset is
 * about 2 MB and must never reach the browser bundle.
 */

export interface CityMatch {
  key: string
  label: string
  name: string
  timezone: string
  lat: number
  lng: number
}

export const maxCityMatches = 10

interface CityRow {
  city: string
  city_ascii: string
  province: string
  country: string
  iso2: string
  timezone: string
  lat: number
  lng: number
  pop: number
}

function cityKeyFor(row: CityRow): string {
  return `${row.iso2}:${row.province}:${row.city_ascii}`.toLowerCase()
}

function toMatch(row: CityRow, key: string): CityMatch {
  const region = row.province ? `${row.province}, ${row.country}` : row.country
  return {
    key,
    label: `${row.city}, ${region}`,
    name: row.city,
    timezone: row.timezone,
    lat: row.lat,
    lng: row.lng,
  }
}

const usable: { row: CityRow; key: string; needle: string }[] = (cityMapping as CityRow[])
  .filter(
    (row) =>
      typeof row.timezone === 'string' && row.timezone.length > 0 && isValidTimeZone(row.timezone),
  )
  .map((row) => ({
    row,
    key: cityKeyFor(row),
    needle: `${row.city_ascii} ${row.city}`.toLowerCase(),
  }))
  .sort((a, b) => b.row.pop - a.row.pop)

const byKey = new Map(usable.map((entry) => [entry.key, entry]))

/** Case-insensitive prefix-first, then substring matches, largest cities first. */
export function searchCities(query: string, limit = maxCityMatches): CityMatch[] {
  const needle = query.trim().toLowerCase()
  if (needle.length < 2) return []
  const prefix = usable.filter((entry) => entry.needle.startsWith(needle))
  const contains = usable.filter(
    (entry) => !entry.needle.startsWith(needle) && entry.needle.includes(needle),
  )
  return [...prefix, ...contains].slice(0, limit).map((entry) => toMatch(entry.row, entry.key))
}

export function resolveCity(key: string): CityMatch | null {
  const entry = byKey.get(key)
  return entry ? toMatch(entry.row, entry.key) : null
}
