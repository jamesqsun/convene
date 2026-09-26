import { addLocalDays, advanceAssignmentMs, localDateOf, minute, zonedTime } from '@/lib/time'
import { minOverlapMs } from '../types'

/**
 * Which city batches a tick should run (technical design section 2).
 *
 * The main pass for a city targets the local date two days ahead and becomes due the moment the
 * city's clock passes midnight. After it finishes, hourly catch-up passes pick up late slots for
 * that same date for as long as a qualifying window could still satisfy the 48-hour rule. Nothing
 * targets tomorrow: at midnight, no window on tomorrow can be 48 hours away.
 */

export const catchupIntervalMs = 60 * minute
export const maxBatchAttempts = 5
export const targetOffsetDays = 2

export interface CityClock {
  cityKey: string
  timezone: string
}

export interface BatchState {
  cityKey: string
  localDate: string
  status: 'pending' | 'running' | 'done' | 'failed'
  attempts: number
  finishedAt: number | null
  /** Null or past means whoever was running it is gone and the pass may be retried. */
  leaseExpiresAt: number | null
}

export interface DueBatch {
  cityKey: string
  timezone: string
  localDate: string
  kind: 'main' | 'catchup'
}

export function targetDateFor(city: CityClock, now: number): string {
  return addLocalDays(localDateOf(city.timezone, now), targetOffsetDays)
}

/** True while at least a minimum-overlap window on the date can still start 48 hours out. */
export function isDateStillPlannable(timezone: string, localDate: string, now: number): boolean {
  const dayEnd = zonedTime(timezone, addLocalDays(localDate, 1))
  return dayEnd - minOverlapMs >= now + advanceAssignmentMs
}

function dueFor(
  city: CityClock,
  state: BatchState | undefined,
  now: number,
  catchupInterval: number,
): DueBatch | null {
  const localDate = targetDateFor(city, now)
  const base = { cityKey: city.cityKey, timezone: city.timezone, localDate }
  if (!state) return { ...base, kind: 'main' }
  const isRetryable = state.attempts < maxBatchAttempts
  if (state.status === 'running') {
    const isLeaseLive = state.leaseExpiresAt !== null && state.leaseExpiresAt >= now
    return !isLeaseLive && isRetryable ? { ...base, kind: 'main' } : null
  }
  if (state.status !== 'done') return isRetryable ? { ...base, kind: 'main' } : null
  if (!isDateStillPlannable(city.timezone, localDate, now)) return null
  const isIntervalElapsed = state.finishedAt === null || now - state.finishedAt >= catchupInterval
  return isIntervalElapsed ? { ...base, kind: 'catchup' } : null
}

export function dueBatches(
  cities: readonly CityClock[],
  states: readonly BatchState[],
  now: number,
  catchupInterval = catchupIntervalMs,
): DueBatch[] {
  const due: DueBatch[] = []
  for (const city of cities) {
    const localDate = targetDateFor(city, now)
    const state = states.find(
      (candidate) => candidate.cityKey === city.cityKey && candidate.localDate === localDate,
    )
    const batch = dueFor(city, state, now, catchupInterval)
    if (batch) due.push(batch)
  }
  return due
}
