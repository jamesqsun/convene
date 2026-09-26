import { beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '@/lib/db'
import {
  bookGroup,
  count,
  createProposal,
  createSlot,
  createTestDb,
  createUser,
} from '../tests/harness'

let db: Db

beforeAll(async () => {
  db = await createTestDb()
})

const beforeStart = '2026-10-03T12:00:00Z'

let dateCounter = 3

async function book(n: number) {
  const users: string[] = []
  for (let i = 0; i < n; i += 1) users.push(await createUser(db))
  const localDate = `2026-10-${String(dateCounter++).padStart(2, '0')}`
  const s = `${localDate}T22:00:00Z`
  const e = `${localDate}T23:00:00Z`
  const { eventId, members } = await bookGroup(db, {
    localDate,
    startIso: s,
    endIso: e,
    nowIso: `${localDate.slice(0, 8)}01T00:00:00Z`,
    users,
  })
  return { users, eventId, members, localDate, startIso: s }
}

async function withdraw(eventId: string, userId: string, nowIso: string): Promise<string> {
  const rows = await db.query<{ result: string }>(
    'select withdraw_participant($1, $2, $3::timestamptz) as result',
    [eventId, userId, nowIso],
  )
  return rows[0]!.result
}

async function eventStatus(eventId: string): Promise<string> {
  return (
    await db.query<{ status: string }>('select status from events where id = $1', [eventId])
  )[0]!.status
}

async function slotState(slotId: string): Promise<{ status: string; revision: number }> {
  return (
    await db.query<{ status: string; revision: number }>(
      'select status, revision from availability_slots where id = $1',
      [slotId],
    )
  )[0]!
}

async function jobs(eventId: string, type: string): Promise<string[]> {
  const rows = await db.query<{ recipient_id: string }>(
    'select recipient_id from notification_jobs where event_id = $1 and type = $2 order by recipient_id',
    [eventId, type],
  )
  return rows.map((row) => row.recipient_id)
}

describe('withdraw_participant', () => {
  it('removes one person from a group of three and keeps the event', async () => {
    const { users, eventId, members } = await book(3)
    const [leaver, ...remaining] = users
    expect(await withdraw(eventId, leaver!, beforeStart)).toBe('withdrawn')
    expect(await eventStatus(eventId)).toBe('scheduled')

    const participant = await db.query<{ withdrawn_at: Date | null }>(
      'select withdrawn_at from event_participants where event_id = $1 and user_id = $2',
      [eventId, leaver!],
    )
    expect(participant[0]!.withdrawn_at).toBeInstanceOf(Date)
    expect(
      await count(db, 'participant_reservations', 'event_id = $1 and user_id = $2', [
        eventId,
        leaver!,
      ]),
    ).toBe(0)
    expect(
      await count(db, 'user_date_assignments', 'event_id = $1 and user_id = $2', [
        eventId,
        leaver!,
      ]),
    ).toBe(0)
    expect(await count(db, 'participant_reservations', 'event_id = $1', [eventId])).toBe(2)

    const leaverSlot = members.find((m) => m.user_id === leaver)!
    expect(await slotState(leaverSlot.slot_id)).toEqual({ status: 'cancelled', revision: 3 })
    for (const member of members.filter((m) => m.user_id !== leaver)) {
      expect((await slotState(member.slot_id)).status).toBe('filled')
    }
    expect(await jobs(eventId, 'participant_left')).toEqual([...remaining].sort())
    expect(await jobs(eventId, 'cancellation')).toEqual([])
  })

  it('cancels the event for the remaining person when a pair drops to one', async () => {
    const { users, eventId, members } = await book(2)
    const [leaver, remaining] = users
    expect(await withdraw(eventId, leaver!, beforeStart)).toBe('event_cancelled')
    expect(await eventStatus(eventId)).toBe('cancelled')
    expect(await count(db, 'participant_reservations', 'event_id = $1', [eventId])).toBe(0)
    expect(await count(db, 'user_date_assignments', 'event_id = $1', [eventId])).toBe(0)
    for (const member of members) expect((await slotState(member.slot_id)).status).toBe('cancelled')
    expect(await jobs(eventId, 'cancellation')).toEqual([remaining!])
    const stayed = await db.query<{ withdrawn_at: Date | null }>(
      'select withdrawn_at from event_participants where event_id = $1 and user_id = $2',
      [eventId, remaining!],
    )
    expect(stayed[0]!.withdrawn_at).toBeNull()
  })

  it('is idempotent and safe after cancellation', async () => {
    const { users, eventId } = await book(2)
    const [leaver, remaining] = users
    await withdraw(eventId, leaver!, beforeStart)
    const jobsBefore = await count(db, 'notification_jobs', 'event_id = $1', [eventId])
    expect(await withdraw(eventId, leaver!, beforeStart)).toBe('already_cancelled')
    expect(await withdraw(eventId, remaining!, beforeStart)).toBe('already_cancelled')
    expect(await count(db, 'notification_jobs', 'event_id = $1', [eventId])).toBe(jobsBefore)
  })

  it('reports already_withdrawn for a repeat on a surviving event', async () => {
    const { users, eventId } = await book(3)
    await withdraw(eventId, users[0]!, beforeStart)
    expect(await withdraw(eventId, users[0]!, beforeStart)).toBe('already_withdrawn')
    expect(await withdraw(eventId, users[1]!, beforeStart)).toBe('event_cancelled')
    expect(await count(db, 'participant_reservations', 'event_id = $1', [eventId])).toBe(0)
  })

  it('rejects withdrawal at or after the start and from non-participants', async () => {
    const { users, eventId, startIso } = await book(2)
    await expect(withdraw(eventId, users[0]!, startIso)).rejects.toThrow(/event_started/)
    await expect(
      withdraw(eventId, users[0]!, new Date(Date.parse(startIso) + 60_000).toISOString()),
    ).rejects.toThrow(/event_started/)
    const stranger = await createUser(db)
    await expect(withdraw(eventId, stranger, beforeStart)).rejects.toThrow(/not_participant/)
    await expect(
      withdraw('00000000-0000-0000-0000-000000000000', stranger, beforeStart),
    ).rejects.toThrow(/event_not_found/)
  })

  it('lets a withdrawn person be booked again on the same date', async () => {
    const { users, eventId, localDate } = await book(3)
    const leaver = users[0]!
    await withdraw(eventId, leaver, beforeStart)
    const partner = await createUser(db)
    const batch = (
      await db.query<{ id: string }>('select id from planning_batches where local_date = $1', [
        localDate,
      ])
    )[0]!.id
    const leaverSlot = await createSlot(
      db,
      leaver,
      `${localDate}T14:00:00Z`,
      `${localDate}T16:00:00Z`,
    )
    const partnerSlot = await createSlot(
      db,
      partner,
      `${localDate}T14:00:00Z`,
      `${localDate}T16:00:00Z`,
    )
    const planningId = await createProposal(db, {
      batchId: batch,
      members: [
        { user_id: leaver, slot_id: leaverSlot.id, revision: leaverSlot.revision },
        { user_id: partner, slot_id: partnerSlot.id, revision: partnerSlot.revision },
      ],
      startIso: `${localDate}T14:00:00Z`,
      endIso: `${localDate}T15:00:00Z`,
    })
    await expect(
      db.query('select commit_group_event($1, $2::timestamptz)', [
        planningId,
        `${localDate.slice(0, 8)}01T00:00:00Z`,
      ]),
    ).resolves.toBeDefined()
  })
})
