import { day } from '@/lib/time'

export const fadeDays = 90
export const minimumOpacity = 0.25

/** Lines fade with time since the last completed shared hangout but never disappear. */
export function edgeOpacity(lastMetAt: number, now: number): number {
  const daysSince = Math.max(0, (now - lastMetAt) / day)
  return Math.max(minimumOpacity, 1 - daysSince / fadeDays)
}
