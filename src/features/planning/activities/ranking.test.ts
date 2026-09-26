import { describe, expect, it } from 'vitest'
import { hour, zonedTime } from '@/lib/time'
import type { ProfileSnapshot } from '../types'
import {
  buildRankingInput,
  fallbackRanking,
  mergeRankings,
  validateRanking,
  windowMinutesOf,
} from './ranking'

const tz = 'America/Toronto'
const start = zonedTime(tz, '2026-10-03', 18)
const window = { start, end: start + 2 * hour }

const profile = (
  userId: string,
  interests: string[],
  memories: { topic: string; summary: string }[] = [],
): ProfileSnapshot => ({
  userId,
  embedding: [0.1, 0.2],
  interests,
  memories,
})

describe('buildRankingInput', () => {
  it('exposes aliases, public interests, memory summaries, and the window, nothing else', () => {
    const input = buildRankingInput(
      [
        profile('user-b', ['coffee'], [{ topic: 'cafes', summary: 'Likes quiet spots.' }]),
        profile('user-a', ['hiking', 'coffee']),
      ],
      window,
      tz,
    )
    expect(input).toMatchObject({
      groupSize: 2,
      windowMinutes: 120,
      weekday: 'Saturday',
      localStart: '18:00',
    })
    expect(input.participants.map((p) => p.alias)).toEqual(['P1', 'P2'])
    expect(input.participants[0]!.interests).toEqual(['hiking', 'coffee'])
    expect(input.participants[1]!.memories).toEqual([
      { topic: 'cafes', summary: 'Likes quiet spots.' },
    ])
    const serialized = JSON.stringify(input)
    for (const forbidden of [
      'user-a',
      'user-b',
      'userId',
      'phone',
      'embedding',
      'evidence',
      'lat',
      'lng',
    ]) {
      expect(serialized).not.toContain(forbidden)
    }
    expect(windowMinutesOf(window)).toBe(120)
  })
})

describe('validateRanking', () => {
  it('drops unknown ids, non-catalog durations, oversized durations, extra fields, and duplicates', () => {
    const raw = {
      ranked: [
        { activityId: 'coffee', durationMinutes: 90 },
        { activityId: 'coffee', durationMinutes: 60 },
        { activityId: 'skydiving', durationMinutes: 60 },
        { activityId: 'bowling', durationMinutes: 75 },
        { activityId: 'museum_visit', durationMinutes: 180 },
      ],
      rationale: 'ok',
    }
    expect(validateRanking(raw, 120)).toEqual([{ activityId: 'coffee', durationMinutes: 90 }])
    expect(validateRanking({ ...raw, extra: true }, 120)).toEqual([])
    expect(validateRanking({ ranked: [], rationale: '' }, 120)).toEqual([])
    expect(validateRanking('garbage', 120)).toEqual([])
  })
})

describe('fallbackRanking', () => {
  it('prefers activities matching more members and picks the longest duration that fits', () => {
    const ranked = fallbackRanking(
      [profile('a', ['climbing']), profile('b', ['climbing', 'sports']), profile('c', ['coffee'])],
      120,
    )
    expect(ranked[0]).toEqual({ activityId: 'bouldering', durationMinutes: 120 })
    expect(ranked).toHaveLength(5)
    expect(ranked.every((item) => item.durationMinutes <= 120)).toBe(true)
  })

  it('excludes activities that cannot fit and is deterministic without interests', () => {
    const ranked = fallbackRanking([profile('a', []), profile('b', [])], 60)
    expect(ranked.map((item) => item.activityId)).toEqual([
      'bowling',
      'coffee',
      'market_stroll',
      'mini_golf',
      'park_walk',
    ])
    expect(ranked.every((item) => item.durationMinutes === 60)).toBe(true)
  })
})

describe('mergeRankings', () => {
  it('keeps model order first and appends unseen fallbacks up to the cap', () => {
    const primary = [{ activityId: 'coffee', durationMinutes: 60 }]
    const fallback = fallbackRanking([profile('a', ['coffee'])], 60)
    const merged = mergeRankings(primary, fallback)
    expect(merged[0]).toEqual(primary[0])
    expect(merged).toHaveLength(5)
    expect(new Set(merged.map((m) => m.activityId)).size).toBe(5)
  })
})
