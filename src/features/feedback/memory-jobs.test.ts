import { expect, it, vi } from 'vitest'
import { fakeAiProvider } from '@/features/ai/fake'
import { bookGroup, count, createTestDb, createUser } from '../../../supabase/tests/harness'
import { saveEventFeedback } from './event'
import { drainFeedbackMemoryJobs, retryFeedbackMemoryJob } from './memory-jobs'

it('leases pending feedback, retries failures with backoff, recovers crashes, and avoids duplicates', async () => {
  const db = await createTestDb(),
    a = await createUser(db),
    b = await createUser(db)
  const { eventId } = await bookGroup(db, {
    localDate: '2026-10-03',
    startIso: '2026-10-03T18:00:00Z',
    endIso: '2026-10-03T19:00:00Z',
    nowIso: '2026-10-01T00:00:00Z',
    users: [a, b],
  })
  let now = Date.parse('2026-10-04T00:00:00Z')
  const ai = fakeAiProvider(),
    target = { eventId, userId: a }
  await saveEventFeedback(
    db,
    a,
    { eventId, text: 'I prefer quiet cafes so I can hear everyone.' },
    now,
  )
  await db.query('update event_feedback set memory_next_attempt_at = $1', [
    new Date(now).toISOString(),
  ])
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const broken = {
    ...ai,
    extractMemories: async () => {
      throw new Error('offline')
    },
  }
  expect(await drainFeedbackMemoryJobs(db, broken, () => now)).toMatchObject({
    claimed: 1,
    failed: 1,
  })
  expect(await drainFeedbackMemoryJobs(db, ai, () => now)).toMatchObject({ claimed: 0 })
  now += 2 * 60_000
  await db.query('update event_feedback set memory_lease_until = $1', [
    new Date(now + 600_000).toISOString(),
  ])
  expect(await drainFeedbackMemoryJobs(db, ai, () => now)).toMatchObject({ claimed: 0 })
  now += 600_001
  await db.query('update event_feedback set memory_attempts = 5')
  expect(await drainFeedbackMemoryJobs(db, ai, () => now)).toMatchObject({ claimed: 0 })
  await retryFeedbackMemoryJob(db, eventId, a, now)
  const extract = vi.spyOn(ai, 'extractMemories')
  const results = await Promise.all([
    drainFeedbackMemoryJobs(db, ai, () => now, target),
    drainFeedbackMemoryJobs(db, ai, () => now, target),
  ])
  expect(results.reduce((sum, result) => sum + result.updated, 0)).toBe(1)
  expect(extract).toHaveBeenCalledTimes(1)
  expect(await count(db, 'preference_memories')).toBe(1)
  expect(await drainFeedbackMemoryJobs(db, ai, () => now)).toMatchObject({ claimed: 0 })
})
