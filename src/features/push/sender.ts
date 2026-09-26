import type { Db } from '@/lib/db'
import { minute } from '@/lib/time'
import { type NotificationType, notificationPayload } from './payloads'
import type { PushOutcome, PushSender } from './provider'

/**
 * Post-commit delivery of notification jobs. Jobs are claimed in small batches with
 * `for update skip locked`, every active device of the recipient gets one attempt, invalid
 * subscriptions are retired, and transient failures back off exponentially up to a bounded
 * number of attempts. In-app state never depends on any of this succeeding.
 */

export const maxDeliveryAttempts = 5
export const defaultDrainLimit = 50

export interface DrainSummary {
  claimed: number
  done: number
  retried: number
  failed: number
  retired: number
}

interface JobRow {
  id: string
  event_id: string
  recipient_id: string
  type: NotificationType
  payload: { remaining?: number }
  attempts: number
}

interface SubscriptionRow {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

async function claimJobs(db: Db, now: number, limit: number): Promise<JobRow[]> {
  return db.transaction((tx) =>
    tx.query<JobRow>(
      `update notification_jobs set attempts = attempts + 1
       where id in (
         select id from notification_jobs where status = 'pending' and next_attempt_at <= $1::timestamptz
         order by next_attempt_at limit $2 for update skip locked)
       returning id, event_id, recipient_id, type, payload, attempts`,
      [new Date(now).toISOString(), limit],
    ),
  )
}

async function payloadFor(db: Db, job: JobRow): Promise<string | null> {
  const rows = await db.query<{
    id: string
    activity_name: string
    starts_at: Date
    timezone: string
    venue_name: string
  }>(
    `select id, activity_name, starts_at, timezone, coalesce(venue->>'name', '') as venue_name from events where id = $1`,
    [job.event_id],
  )
  const event = rows[0]
  if (!event) return null
  const payload = notificationPayload(
    job.type,
    {
      id: event.id,
      activityName: event.activity_name,
      startsAt: event.starts_at.getTime(),
      timezone: event.timezone,
      venueName: event.venue_name,
    },
    job.payload.remaining ?? null,
  )
  return JSON.stringify(payload)
}

async function recordDelivery(
  db: Db,
  jobId: string,
  subscription: SubscriptionRow,
  outcome: PushOutcome,
  now: number,
): Promise<void> {
  const status =
    outcome.status === 'sent' ? 'sent' : outcome.status === 'gone' ? 'retired' : 'failed'
  const error = outcome.status === 'failed' ? outcome.error : null
  await db.query(
    `insert into notification_deliveries (job_id, subscription_id, status, attempts, last_status_code, last_error, updated_at)
     values ($1, $2, $3, 1, $4, $5, $6::timestamptz)
     on conflict (job_id, subscription_id) do update set
       status = excluded.status, attempts = notification_deliveries.attempts + 1,
       last_status_code = excluded.last_status_code, last_error = excluded.last_error, updated_at = excluded.updated_at`,
    [jobId, subscription.id, status, outcome.statusCode, error, new Date(now).toISOString()],
  )
  if (outcome.status === 'gone') {
    await db.query(
      'update push_subscriptions set retired_at = $2::timestamptz where id = $1 and retired_at is null',
      [subscription.id, new Date(now).toISOString()],
    )
  }
}

async function settleJob(
  db: Db,
  job: JobRow,
  isSettled: boolean,
  now: number,
  error: string | null,
): Promise<'done' | 'retried' | 'failed'> {
  const nowIso = new Date(now).toISOString()
  if (isSettled) {
    await db.query(
      "update notification_jobs set status = 'done', finished_at = $2::timestamptz, last_error = $3 where id = $1",
      [job.id, nowIso, error],
    )
    return 'done'
  }
  if (job.attempts >= maxDeliveryAttempts) {
    await db.query(
      "update notification_jobs set status = 'failed', finished_at = $2::timestamptz, last_error = $3 where id = $1",
      [job.id, nowIso, error],
    )
    return 'failed'
  }
  const backoffMs = 2 ** job.attempts * minute
  await db.query(
    'update notification_jobs set next_attempt_at = $2::timestamptz, last_error = $3 where id = $1',
    [job.id, new Date(now + backoffMs).toISOString(), error],
  )
  return 'retried'
}

async function deliverJob(
  db: Db,
  push: PushSender,
  job: JobRow,
  now: number,
): Promise<{ result: 'done' | 'retried' | 'failed'; retired: number }> {
  const payload = await payloadFor(db, job)
  if (!payload) return { result: await settleJob(db, job, true, now, 'event_missing'), retired: 0 }
  const subscriptions = await db.query<SubscriptionRow>(
    'select id, endpoint, p256dh, auth from push_subscriptions where user_id = $1 and retired_at is null order by created_at',
    [job.recipient_id],
  )
  if (subscriptions.length === 0)
    return { result: await settleJob(db, job, true, now, 'no_device'), retired: 0 }
  let retired = 0
  let failures = 0
  for (const subscription of subscriptions) {
    const outcome = await push.send(subscription, payload)
    await recordDelivery(db, job.id, subscription, outcome, now)
    if (outcome.status === 'gone') retired += 1
    if (outcome.status === 'failed') failures += 1
  }
  const result = await settleJob(
    db,
    job,
    failures === 0,
    now,
    failures === 0 ? null : `${failures} device(s) failed`,
  )
  return { result, retired }
}

export async function drainNotificationJobs(
  db: Db,
  push: PushSender,
  now: number,
  limit = defaultDrainLimit,
): Promise<DrainSummary> {
  const jobs = await claimJobs(db, now, limit)
  const summary: DrainSummary = { claimed: jobs.length, done: 0, retried: 0, failed: 0, retired: 0 }
  for (const job of jobs) {
    const { result, retired } = await deliverJob(db, push, job, now)
    summary[result] += 1
    summary.retired += retired
  }
  return summary
}
