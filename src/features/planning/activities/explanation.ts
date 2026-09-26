import type { ProfileSnapshot } from '../types'

/**
 * The explanation every participant sees. Built only from public interests and the activity, so
 * it can never paraphrase someone's private memories, answers, or feedback.
 */
export function buildExplanation(
  profiles: readonly ProfileSnapshot[],
  activityName: string,
): string {
  const shared = sharedInterests(profiles)
  if (shared.length === 0) {
    return `We matched you on similar tastes, and ${activityName.toLowerCase()} fits everyone's schedule.`
  }
  return `You share an interest in ${listWords(shared)}, so we picked ${activityName.toLowerCase()}.`
}

/** Interests held by at least two members, most common first, at most three. */
export function sharedInterests(profiles: readonly ProfileSnapshot[]): string[] {
  const counts = new Map<string, number>()
  for (const profile of profiles) {
    for (const interest of new Set(profile.interests))
      counts.set(interest, (counts.get(interest) ?? 0) + 1)
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([interest]) => interest)
}

function listWords(words: readonly string[]): string {
  if (words.length === 1) return words[0]!
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
}
