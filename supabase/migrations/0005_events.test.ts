import { beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '@/lib/db'
import {
  createBatch,
  createProposal,
  createSlot,
  createTestDb,
  createUser,
  planFor,
} from '../tests/harness'

let db: Db

beforeAll(async () => {
  db = await createTestDb()
})

const start = '2026-10-03T22:00:00Z'
const end = '2026-10-03T23:00:00Z'

/** Inserts an event row directly (bypassing commit_group_event) for constraint tests. */
async function insertEvent(startIso = start, endIso = end): Promise<string> {
  const batchId = await createBatch(db, `2026-10-${String(3 + eventCounter++).padStart(2, '0')}`)
  const userId = await createUser(db)
  const slot = await createSlot(db, userId, startIso, endIso)
  const planningId = await createProposal(db, {
    batchId,
    members: [{ user_id: userId, slot_id: slot.id, revision: slot.revision }],
    startIso,
    endIso,
  })
  const plan = planFor(startIso, endIso)
  const rows = await db.query<{ id: string }>(
    `insert into events (planning_id, city_key, timezone, local_date, activity_id, activity_name, duration_minutes, venue, starts_at, ends_at)
     values ($1, 'ca:ontario:toronto', 'America/Toronto', '2026-10-03', 'coffee', 'Coffee', 60, $2::jsonb, $3, $4) returning id`,
    [planningId, JSON.stringify(plan.venue), startIso, endIso],
  )
  return rows[0]!.id
}
let eventCounter = 0

describe('events', () => {
  it('requires start before end', async () => {
    await expect(insertEvent(end, start)).rejects.toThrow()
  })

  it('links a slot only to an existing event', async () => {
    const userId = await createUser(db)
    const slot = await createSlot(db, userId, start, end)
    await expect(
      db.query(
        "update availability_slots set status = 'filled', assigned_event_id = gen_random_uuid() where id = $1",
        [slot.id],
      ),
    ).rejects.toThrow(/foreign key/)
  })
})

describe('participant_reservations', () => {
  it('rejects overlapping bookings for one person and allows adjacent ones', async () => {
    const userId = await createUser(db)
    const first = await insertEvent()
    const second = await insertEvent()
    const third = await insertEvent()
    const reserve = (eventId: string, s: string, e: string) =>
      db.query(
        `insert into participant_reservations (event_id, user_id, "window") values ($1, $2, tstzrange($3::timestamptz, $4::timestamptz, '[)'))`,
        [eventId, userId, s, e],
      )
    await reserve(first, start, end)
    await expect(reserve(second, '2026-10-03T22:30:00Z', '2026-10-03T23:30:00Z')).rejects.toThrow(
      /exclusion/,
    )
    await expect(reserve(third, end, '2026-10-04T00:00:00Z')).resolves.toBeDefined()
  })
})

describe('user_date_assignments and event_participants', () => {
  it('allows one event per person per local date', async () => {
    const userId = await createUser(db)
    const first = await insertEvent()
    const second = await insertEvent()
    await db.query(
      "insert into user_date_assignments (user_id, local_date, event_id) values ($1, '2026-10-03', $2)",
      [userId, first],
    )
    await expect(
      db.query(
        "insert into user_date_assignments (user_id, local_date, event_id) values ($1, '2026-10-03', $2)",
        [userId, second],
      ),
    ).rejects.toThrow(/duplicate|unique/)
  })

  it('allows one event per slot', async () => {
    const userId = await createUser(db)
    const slot = await createSlot(db, userId, start, end)
    const first = await insertEvent()
    const second = await insertEvent()
    await db.query(
      'insert into event_participants (event_id, user_id, slot_id) values ($1, $2, $3)',
      [first, userId, slot.id],
    )
    await expect(
      db.query('insert into event_participants (event_id, user_id, slot_id) values ($1, $2, $3)', [
        second,
        userId,
        slot.id,
      ]),
    ).rejects.toThrow(/duplicate|unique/)
  })
})
