import { beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '@/lib/db'
import { bookGroup, createTestDb, createUser } from '../tests/harness'

let db: Db
let eventId: string
let alice: string
let bob: string

beforeAll(async () => {
  db = await createTestDb()
  alice = await createUser(db)
  bob = await createUser(db)
  const booking = await bookGroup(db, {
    localDate: '2026-10-03',
    startIso: '2026-10-03T22:00:00Z',
    endIso: '2026-10-03T23:00:00Z',
    nowIso: '2026-10-01T12:00:00Z',
    users: [alice, bob],
  })
  eventId = booking.eventId
})

describe('participant_feedback', () => {
  it('rejects self feedback and duplicate answers', async () => {
    await expect(
      db.query(
        'insert into participant_feedback (event_id, author_id, subject_id, meet_again) values ($1, $2, $2, true)',
        [eventId, alice],
      ),
    ).rejects.toThrow()
    await db.query(
      'insert into participant_feedback (event_id, author_id, subject_id, meet_again) values ($1, $2, $3, true)',
      [eventId, alice, bob],
    )
    await expect(
      db.query(
        'insert into participant_feedback (event_id, author_id, subject_id, meet_again) values ($1, $2, $3, false)',
        [eventId, alice, bob],
      ),
    ).rejects.toThrow(/duplicate|unique/)
  })
})

describe('friendships', () => {
  it('stores each unordered pair once with the smaller id first', async () => {
    const [low, high] = [alice, bob].sort()
    await expect(
      db.query(
        'insert into friendships (user_a, user_b, provenance_event_id) values ($1, $2, $3)',
        [high, low, eventId],
      ),
    ).rejects.toThrow()
    await db.query(
      'insert into friendships (user_a, user_b, provenance_event_id) values ($1, $2, $3)',
      [low, high, eventId],
    )
    await expect(
      db.query(
        'insert into friendships (user_a, user_b, provenance_event_id) values ($1, $2, $3)',
        [low, high, eventId],
      ),
    ).rejects.toThrow(/duplicate|unique/)
  })
})
