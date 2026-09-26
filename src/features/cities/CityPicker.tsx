'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/client-api'

export interface CityOption {
  key: string
  label: string
}

export interface CityPickerProps {
  value: CityOption | null
  onChange: (city: CityOption | null) => void
}

const debounceMs = 250

/** Type-ahead against /api/cities. The user must pick a labelled match; free text is never saved. */
export function CityPicker({ value, onChange }: CityPickerProps) {
  const [query, setQuery] = useState(value?.label ?? '')
  const [matches, setMatches] = useState<CityOption[]>([])

  useEffect(() => {
    if (query.trim().length < 2 || query === value?.label) {
      setMatches([])
      return
    }
    const timer = setTimeout(() => {
      apiFetch<{ matches: CityOption[] }>(`/api/cities?q=${encodeURIComponent(query)}`)
        .then((body) => setMatches(body.matches))
        .catch(() => setMatches([]))
    }, debounceMs)
    return () => clearTimeout(timer)
  }, [query, value])

  return (
    <div>
      <input
        type="text"
        value={query}
        placeholder="Start typing your city"
        aria-label="City"
        onChange={(event) => {
          setQuery(event.target.value)
          if (value) onChange(null)
        }}
        className="w-full rounded-lg border border-stone-300 px-3 py-2"
      />
      {matches.length > 0 && (
        <ul
          role="listbox"
          className="mt-1 divide-y divide-stone-100 rounded-lg border border-stone-200 bg-white"
        >
          {matches.map((match) => (
            <li key={match.key}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => {
                  onChange(match)
                  setQuery(match.label)
                  setMatches([])
                }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-stone-50"
              >
                {match.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {value && <p className="mt-1 text-xs text-emerald-700">Selected: {value.label}</p>}
    </div>
  )
}
