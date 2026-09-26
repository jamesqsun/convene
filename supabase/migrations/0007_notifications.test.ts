import { beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '@/lib/db'
import { bookGroup, createTestDb, createUser } from '../tests/harness'

let db: Db
let eventId: string
let alice: string

beforeAll(async () => {
  db = await createTestDb()
  alice = await createUser(db)
  const bob = await createUser(db)
  const booking = await bookGroup(db, {
    localDate: '2026-10-03',
    startIso: '2026-10-03T22:00:00Z',
    endIso: '2026-10-03T23:00:00Z',
    nowIso: '2026-10-01T12:00:00Z',
    users: [alice, bob],
  })
  eventId = booking.eventId
})

describe('notification_jobs', () => {
  it('deduplicates by event, recipient, and type', async () => {
    await expect(
      db.query(
        "insert into notification_jobs (event_id, recipient_id, type) values ($1, $2, 'assignment')",
        [eventId, alice],
      ),
    ).rejects.toThrow(/duplicate|unique/)
    await expect(
      db.query(
        "insert into notification_jobs (event_id, recipient_id, type) values ($1, $2, 'cancellation')",
        [eventId, alice],
      ),
    ).resolves.toBeDefined()
  })

  it('constrains type and status', async () => {
    await expect(
      db.query(
        "insert into notification_jobs (event_id, recipient_id, type) values ($1, $2, 'sms')",
        [eventId, alice],
      ),
    ).rejects.toThrow(/type/)
  })
})

describe('push_subscriptions and deliveries', () => {
  it('keeps endpoints unique and delivery statuses constrained', async () => {
    const insert = (userId: string) =>
      db.query(
        "insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://push.example/abc', 'k', 'a') returning id",
        [userId],
      )
    const first = await insert(alice)
    await expect(insert(alice)).rejects.toThrow(/duplicate|unique/)
    const job = await db.query<{ id: string }>(
      "select id from notification_jobs where event_id = $1 and recipient_id = $2 and type = 'assignment'",
      [eventId, alice],
    )
    await expect(
      db.query(
        "insert into notification_deliveries (job_id, subscription_id, status) values ($1, $2, 'queued')",
        [job[0]!.id, (first[0] as { id: string }).id],
      ),
    ).rejects.toThrow(/status/)
  })
})
