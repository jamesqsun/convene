import { z } from 'zod'
import { localClockOf, localParts, minute, weekdayNames } from '@/lib/time'
import type { ProfileSnapshot } from '../types'
import { type Activity, activities, activityById } from './catalog'

/**
 * Activity ranking (technical design section 7).
 *
 * The model sees aliases, public interests, and each member's own memory summaries. It never sees
 * names, ids, ages, phones, locations, memory evidence, raw answers, or feedback. Its answer is a
 * proposal: ids and durations are validated against the catalog and the group's window, and a
 * deterministic fallback always exists.
 */

export const maxRankedActivities = 5

export const rankingResponseSchema = z
  .object({
    ranked: z
      .array(z.object({ activityId: z.string(), durationMinutes: z.number().int() }).strict())
      .min(1)
      .max(maxRankedActivities),
    rationale: z.string().max(300),
  })
  .strict()

export type RankingResponse = z.infer<typeof rankingResponseSchema>

export interface RankedActivity {
  activityId: string
  durationMinutes: number
}

export interface RankingParticipant {
  alias: string
  interests: string[]
  memories: { topic: string; summary: string }[]
}

export interface RankingInput {
  groupSize: number
  windowMinutes: number
  weekday: string
  localStart: string
  participants: RankingParticipant[]
  activities: {
    id: string
    name: string
    description: string
    durationsMinutes: number[]
    tags: string[]
  }[]
}

export interface Window {
  start: number
  end: number
}

export function windowMinutesOf(window: Window): number {
  return Math.floor((window.end - window.start) / minute)
}

export function buildRankingInput(
  profiles: readonly ProfileSnapshot[],
  window: Window,
  timeZone: string,
): RankingInput {
  const sorted = [...profiles].sort((a, b) => a.userId.localeCompare(b.userId))
  return {
    groupSize: sorted.length,
    windowMinutes: windowMinutesOf(window),
    weekday: weekdayNames[localParts(timeZone, window.start).weekday]!,
    localStart: localClockOf(timeZone, window.start),
    participants: sorted.map((profile, index) => ({
      alias: `P${index + 1}`,
      interests: [...profile.interests],
      memories: profile.memories.map(({ topic, summary }) => ({ topic, summary })),
    })),
    activities: activities.map(({ id, name, description, durationsMinutes, tags }) => ({
      id,
      name,
      description,
      durationsMinutes: [...durationsMinutes],
      tags: [...tags],
    })),
  }
}

function isAllowed(
  activity: Activity | undefined,
  durationMinutes: number,
  windowMinutes: number,
): activity is Activity {
  return (
    activity !== undefined &&
    activity.durationsMinutes.includes(durationMinutes) &&
    durationMinutes <= windowMinutes
  )
}

/** Keeps only well-formed entries the catalog and window permit; an empty result means "use the fallback". */
export function validateRanking(raw: unknown, windowMinutes: number): RankedActivity[] {
  const parsed = rankingResponseSchema.safeParse(raw)
  if (!parsed.success) return []
  const seen = new Set<string>()
  const valid: RankedActivity[] = []
  for (const item of parsed.data.ranked) {
    if (seen.has(item.activityId)) continue
    if (!isAllowed(activityById(item.activityId), item.durationMinutes, windowMinutes)) continue
    seen.add(item.activityId)
    valid.push({ activityId: item.activityId, durationMinutes: item.durationMinutes })
  }
  return valid
}

function longestFittingDuration(activity: Activity, windowMinutes: number): number | null {
  const fitting = activity.durationsMinutes.filter((duration) => duration <= windowMinutes)
  return fitting.length > 0 ? Math.max(...fitting) : null
}

function interestScore(activity: Activity, profiles: readonly ProfileSnapshot[]): number {
  const tags = new Set<string>(activity.tags)
  let score = 0
  for (const profile of profiles) {
    const matches = profile.interests.filter((interest) => tags.has(interest)).length
    // One point for each member with any match, plus a little for depth of match.
    if (matches > 0) score += 1 + matches / 10
  }
  return score
}

/** Deterministic ranking from tag overlap: most-matched first, ties by id, longest fitting duration. */
export function fallbackRanking(
  profiles: readonly ProfileSnapshot[],
  windowMinutes: number,
): RankedActivity[] {
  return activities
    .map((activity) => ({
      activity,
      duration: longestFittingDuration(activity, windowMinutes),
      score: interestScore(activity, profiles),
    }))
    .filter(
      (entry): entry is { activity: Activity; duration: number; score: number } =>
        entry.duration !== null,
    )
    .sort((a, b) => b.score - a.score || a.activity.id.localeCompare(b.activity.id))
    .slice(0, maxRankedActivities)
    .map((entry) => ({ activityId: entry.activity.id, durationMinutes: entry.duration }))
}

/** Model ranking first, then fallback alternates it did not mention, capped to the maximum. */
export function mergeRankings(
  primary: readonly RankedActivity[],
  fallback: readonly RankedActivity[],
): RankedActivity[] {
  const merged = [...primary]
  const seen = new Set(primary.map((item) => item.activityId))
  for (const item of fallback) {
    if (merged.length >= maxRankedActivities) break
    if (seen.has(item.activityId)) continue
    seen.add(item.activityId)
    merged.push(item)
  }
  return merged
}
