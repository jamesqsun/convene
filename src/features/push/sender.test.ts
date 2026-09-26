import { beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '@/lib/db'
import { minute } from '@/lib/time'
import { bookGroup, count, createTestDb, createUser } from '../../../supabase/tests/harness'
import { fakePushSender } from './fake'
import { drainNotificationJobs, maxDeliveryAttempts } from './sender'

let db: Db
let a: string
let b: string
let c: string
let eventId: string
const now = Date.parse('2026-10-01T12:00:00Z')

beforeAll(async () => {
  db = await createTestDb()
  a = await createUser(db)
  b = await createUser(db)
  c = await createUser(db)
  eventId = (
    await bookGroup(db, {
      localDate: '2026-10-03',
      startIso: '2026-10-03T22:00:00Z',
      endIso: '2026-10-03T23:00:00Z',
      nowIso: '2026-10-01T00:00:00Z',
      users: [a, b, c],
    })
  ).eventId
  const subscribe = (userId: string, endpoint: string) =>
    db.query(
      "insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, 'k', 'a')",
      [userId, endpoint],
    )
  await subscribe(a, 'https://push/a-phone')
  await subscribe(a, 'https://push/a-old')
  await subscribe(b, 'https://push/b-phone')
})

async function jobStatus(userId: string): Promise<{ status: string; attempts: number }> {
  return (
    await db.query<{ status: string; attempts: number }>(
      'select status, attempts from notification_jobs where event_id = $1 and recipient_id = $2',
      [eventId, userId],
    )
  )[0]!
}

describe('drainNotificationJobs', () => {
  it('delivers per device, retires gone subscriptions, retries failures, and settles recipients without devices', async () => {
    const push = fakePushSender()
    push.outcomes.set('https://push/a-old', { status: 'gone', statusCode: 410 })
    push.outcomes.set('https://push/b-phone', {
      status: 'failed',
      statusCode: 500,
      error: 'upstream',
    })
    const summary = await drainNotificationJobs(db, push, now)
    expect(summary).toEqual({ claimed: 3, done: 2, retried: 1, failed: 0, retired: 1 })
    expect(await jobStatus(a)).toEqual({ status: 'done', attempts: 1 })
    expect(await jobStatus(b)).toEqual({ status: 'pending', attempts: 1 })
    expect(await jobStatus(c)).toEqual({ status: 'done', attempts: 1 })
    expect(
      await count(
        db,
        'push_subscriptions',
        "endpoint = 'https://push/a-old' and retired_at is not null",
      ),
    ).toBe(1)
    expect(await count(db, 'notification_deliveries', "status = 'sent'")).toBe(1)
    expect(await count(db, 'notification_deliveries', "status = 'retired'")).toBe(1)
    expect(await count(db, 'notification_deliveries', "status = 'failed'")).toBe(1)
    expect(push.sent.map((s) => s.endpoint).sort()).toEqual([
      'https://push/a-old',
      'https://push/a-phone',
      'https://push/b-phone',
    ])
    const payload = JSON.parse(push.sent[0]!.payload) as { title: string; url: string }
    expect(payload.title).toBe('Plan assigned: Coffee')
    expect(payload.url).toBe(`/plans/${eventId}`)
    expect(push.sent[0]!.payload).not.toContain('+1416')
  })

  it('backs off exponentially and gives up after the attempt limit', async () => {
    const push = fakePushSender()
    push.outcomes.set('https://push/b-phone', {
      status: 'failed',
      statusCode: 500,
      error: 'still down',
    })
    expect((await drainNotificationJobs(db, push, now + minute)).claimed).toBe(0)
    let clock = now
    for (let attempt = 2; attempt <= maxDeliveryAttempts; attempt += 1) {
      clock += 2 ** (attempt - 1) * minute
      const summary = await drainNotificationJobs(db, push, clock)
      expect(summary.claimed).toBe(1)
      expect(attempt < maxDeliveryAttempts ? summary.retried : summary.failed).toBe(1)
    }
    expect(await jobStatus(b)).toEqual({ status: 'failed', attempts: maxDeliveryAttempts })
    expect(
      (
        await db.query<{ attempts: number }>(
          "select attempts from notification_deliveries where subscription_id = (select id from push_subscriptions where endpoint = 'https://push/b-phone')",
        )
      )[0]!.attempts,
    ).toBe(maxDeliveryAttempts)
  })

  it('does not claim jobs that are not yet due', async () => {
    const push = fakePushSender()
    expect((await drainNotificationJobs(db, push, now - 10 * minute)).claimed).toBe(0)
  })
})
