import { randomUUID } from 'node:crypto'
import type { AiProvider } from '@/features/ai/provider'
import type { Db } from '@/lib/db'
import { submitEventFeedback } from './event'

const maxAttempts = 5
const leaseMs = 10 * 60_000

export async function retryFeedbackMemoryJob(db: Db, eventId: string, userId: string, now: number) {
  await db.query(
    `update event_feedback set memory_attempts = 0, memory_next_attempt_at = $3::timestamptz,
    memory_lease_until = null, memory_claim_id = null
    where event_id = $1 and user_id = $2 and not memories_updated and memory_attempts >= $4
    and (memory_lease_until is null or memory_lease_until < $3::timestamptz)`,
    [eventId, userId, new Date(now).toISOString(), maxAttempts],
  )
}

/** Atomic lease keeps post-response callbacks and scheduler retries from calling AI twice. */
export async function drainFeedbackMemoryJobs(
  db: Db,
  ai: AiProvider,
  clock: () => number,
  target?: { eventId: string; userId: string },
) {
  const now = clock(),
    claimId = randomUUID()
  const jobs = await db.query<{
    event_id: string
    user_id: string
    text: string
    memory_attempts: number
  }>(
    `with candidates as (
      select event_id, user_id from event_feedback
      where not memories_updated and memory_attempts < $1 and memory_next_attempt_at <= $2::timestamptz
        and (memory_lease_until is null or memory_lease_until < $2::timestamptz)
        and ($3::uuid is null or (event_id = $3 and user_id = $4))
      order by memory_next_attempt_at, created_at limit 2 for update skip locked
    ) update event_feedback f set memory_attempts = memory_attempts + 1,
        memory_lease_until = $5::timestamptz, memory_claim_id = $6::uuid
      from candidates c where f.event_id = c.event_id and f.user_id = c.user_id
      returning f.event_id, f.user_id, f.text, f.memory_attempts`,
    [
      maxAttempts,
      new Date(now).toISOString(),
      target?.eventId ?? null,
      target?.userId ?? null,
      new Date(now + leaseMs).toISOString(),
      claimId,
    ],
  )
  const results = await Promise.all(
    jobs.map(async (job) => {
      let done = false
      try {
        done = (
          await submitEventFeedback(
            db,
            ai,
            job.user_id,
            { eventId: job.event_id, text: job.text },
            clock(),
          )
        ).feedback.memoriesUpdated
      } catch (error) {
        console.error('[feedback] background job failed:', error)
      }
      await db.query(
        `update event_feedback set memory_lease_until = null, memory_claim_id = null,
      memory_next_attempt_at = $4::timestamptz where event_id = $1 and user_id = $2 and memory_claim_id = $3::uuid`,
        [
          job.event_id,
          job.user_id,
          claimId,
          new Date(clock() + 2 ** job.memory_attempts * 60_000).toISOString(),
        ],
      )
      return done
    }),
  )
  return {
    claimed: jobs.length,
    updated: results.filter(Boolean).length,
    failed: results.filter((done) => !done).length,
  }
}
