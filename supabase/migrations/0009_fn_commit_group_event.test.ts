import { beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '@/lib/db'
import {
  type Member,
  commit,
  count,
  createBatch,
  createProposal,
  createSlot,
  createTestDb,
  createUser,
} from '../tests/harness'

let db: Db

beforeAll(async () => {
  db = await createTestDb()
})

// Toronto is UTC-4 in October: 18:00 local = 22:00Z.
const now = '2026-10-01T12:00:00Z'
const date = '2026-10-03'
const start = '2026-10-03T22:00:00Z'
const end = '2026-10-03T23:00:00Z'
const slotStart = '2026-10-03T21:00:00Z'
const slotEnd = '2026-10-04T00:00:00Z'

let dateCounter = 10

/** Each scenario gets its own local date so batch uniqueness and date assignments never collide. */
function nextDate(): string {
  return `2026-10-${String(dateCounter++)}`
}

async function membersFor(userIds: string[], s = slotStart, e = slotEnd): Promise<Member[]> {
  const members: Member[] = []
  for (const userId of userIds) {
    const slot = await createSlot(db, userId, s, e)
    members.push({ user_id: userId, slot_id: slot.id, revision: slot.revision })
  }
  return members
}

async function users(n: number): Promise<string[]> {
  const ids: string[] = []
  for (let i = 0; i < n; i += 1) ids.push(await createUser(db))
  return ids
}

async function slotStatus(
  slotId: string,
): Promise<{ status: string; revision: number; assigned_event_id: string | null }> {
  const rows = await db.query<{
    status: string
    revision: number
    assigned_event_id: string | null
  }>('select status, revision, assigned_event_id from availability_slots where id = $1', [slotId])
  return rows[0]!
}

describe('commit_group_event', () => {
  it('books a group atomically and idempotently', async () => {
    const batchId = await createBatch(db, date)
    const members = await membersFor(await users(3))
    const planningId = await createProposal(db, { batchId, members, startIso: start, endIso: end })
    const eventId = await commit(db, planningId, now)

    const events = await db.query<{
      status: string
      activity_id: string
      local_date: string
      starts_at: Date
    }>('select status, activity_id, local_date::text, starts_at from events where id = $1', [
      eventId,
    ])
    expect(events[0]).toMatchObject({
      status: 'scheduled',
      activity_id: 'coffee',
      local_date: date,
    })
    expect(events[0]!.starts_at.toISOString()).toBe('2026-10-03T22:00:00.000Z')
    expect(await count(db, 'event_participants', 'event_id = $1', [eventId])).toBe(3)
    expect(await count(db, 'participant_reservations', 'event_id = $1', [eventId])).toBe(3)
    expect(await count(db, 'user_date_assignments', 'event_id = $1', [eventId])).toBe(3)
    expect(
      await count(db, 'notification_jobs', "event_id = $1 and type = 'assignment'", [eventId]),
    ).toBe(3)
    for (const member of members) {
      expect(await slotStatus(member.slot_id)).toEqual({
        status: 'filled',
        revision: 2,
        assigned_event_id: eventId,
      })
    }
    const proposal = await db.query<{ status: string; event_id: string }>(
      'select status, event_id from planning_proposals where planning_id = $1',
      [planningId],
    )
    expect(proposal[0]).toEqual({ status: 'committed', event_id: eventId })

    expect(await commit(db, planningId, now)).toBe(eventId)
    expect(await count(db, 'events')).toBe(1)
    expect(await count(db, 'notification_jobs')).toBe(3)
  })

  it('rejects stale revisions, non-pending slots, wrong owners, and events outside a slot, leaving no rows', async () => {
    const batchId = await createBatch(db, nextDate())
    const [a, b, outsider] = await users(3)
    const members = await membersFor([a!, b!])
    const before = {
      events: await count(db, 'events'),
      reservations: await count(db, 'participant_reservations'),
    }

    const stale = await createProposal(db, {
      batchId,
      members: [{ ...members[0]!, revision: 99 }, members[1]!],
      startIso: start,
      endIso: end,
    })
    await expect(commit(db, stale, now)).rejects.toThrow(/stale_slot/)

    const wrongOwner = await createProposal(db, {
      batchId,
      members: [{ ...members[0]!, user_id: outsider! }, members[1]!],
      startIso: start,
      endIso: end,
    })
    await expect(commit(db, wrongOwner, now)).rejects.toThrow(/stale_slot/)

    const outsideSlot = await createProposal(db, {
      batchId,
      members,
      startIso: '2026-10-03T20:00:00Z',
      endIso: '2026-10-03T21:30:00Z',
    })
    await expect(commit(db, outsideSlot, now)).rejects.toThrow(/stale_slot/)

    await db.query("update availability_slots set status = 'paused' where id = $1", [
      members[0]!.slot_id,
    ])
    const paused = await createProposal(db, { batchId, members, startIso: start, endIso: end })
    await expect(commit(db, paused, now)).rejects.toThrow(/stale_slot/)

    expect(await count(db, 'events')).toBe(before.events)
    expect(await count(db, 'participant_reservations')).toBe(before.reservations)
    expect((await slotStatus(members[1]!.slot_id)).status).toBe('pending')
  })

  it('rejects events that cross the local day boundary', async () => {
    const batchId = await createBatch(db, nextDate())
    const localDate = (
      await db.query<{ d: string }>(
        'select local_date::text as d from planning_batches where id = $1',
        [batchId],
      )
    )[0]!.d
    const nextDay = new Date(Date.parse(`${localDate}T00:00:00Z`) + 86_400_000)
      .toISOString()
      .slice(0, 10)
    // 23:30 local on the target date to 00:30 local the next day.
    const members = await membersFor(await users(2), `${nextDay}T03:00:00Z`, `${nextDay}T05:00:00Z`)
    const planningId = await createProposal(db, {
      batchId,
      members,
      startIso: `${nextDay}T03:30:00Z`,
      endIso: `${nextDay}T04:30:00Z`,
    })
    await expect(commit(db, planningId, `${localDate}T00:00:00Z`)).rejects.toThrow(
      /outside_local_day/,
    )
  })

  it('accepts events on 23-hour and 25-hour local days', async () => {
    const fallBack = await createBatch(db, '2026-11-01')
    // 01:30 to 02:30 EST on the day clocks fall back (06:30Z to 07:30Z).
    let members = await membersFor(await users(2), '2026-11-01T05:00:00Z', '2026-11-01T09:00:00Z')
    let planningId = await createProposal(db, {
      batchId: fallBack,
      members,
      startIso: '2026-11-01T06:30:00Z',
      endIso: '2026-11-01T07:30:00Z',
    })
    await expect(commit(db, planningId, '2026-10-29T00:00:00Z')).resolves.toBeDefined()

    const springForward = await createBatch(db, '2026-03-08')
    // 03:00 to 04:00 EDT right after the gap (07:00Z to 08:00Z).
    members = await membersFor(await users(2), '2026-03-08T06:00:00Z', '2026-03-08T10:00:00Z')
    planningId = await createProposal(db, {
      batchId: springForward,
      members,
      startIso: '2026-03-08T07:00:00Z',
      endIso: '2026-03-08T08:00:00Z',
    })
    await expect(commit(db, planningId, '2026-03-05T00:00:00Z')).resolves.toBeDefined()
  })

  it('enforces exactly 48 elapsed hours of advance assignment', async () => {
    const batchId = await createBatch(db, nextDate())
    const localDate = (
      await db.query<{ d: string }>(
        'select local_date::text as d from planning_batches where id = $1',
        [batchId],
      )
    )[0]!.d
    const s = `${localDate}T22:00:00Z`
    const e = `${localDate}T23:00:00Z`
    const members = await membersFor(
      await users(2),
      `${localDate}T21:00:00Z`,
      `${localDate}T23:59:00Z`,
    )
    const tooLate = await createProposal(db, { batchId, members, startIso: s, endIso: e })
    const justInTime = new Date(Date.parse(s) - 48 * 3_600_000)
    await expect(
      commit(db, tooLate, new Date(justInTime.getTime() + 1000).toISOString()),
    ).rejects.toThrow(/advance_assignment/)
    await expect(commit(db, tooLate, justInTime.toISOString())).resolves.toBeDefined()
  })

  it('rejects groups of one or eleven and duplicated members', async () => {
    const batchId = await createBatch(db, nextDate())
    const [solo] = await users(1)
    const one = await membersFor([solo!])
    await expect(
      commit(
        db,
        await createProposal(db, { batchId, members: one, startIso: start, endIso: end }),
        now,
      ),
    ).rejects.toThrow(/group_size/)

    const eleven = await membersFor(await users(11))
    await expect(
      commit(
        db,
        await createProposal(db, { batchId, members: eleven, startIso: start, endIso: end }),
        now,
      ),
    ).rejects.toThrow(/group_size/)

    const pair = await membersFor(await users(2))
    const duplicated = [pair[0]!, pair[0]!, pair[1]!]
    await expect(
      commit(
        db,
        await createProposal(db, { batchId, members: duplicated, startIso: start, endIso: end }),
        now,
      ),
    ).rejects.toThrow(/group_size/)
  })

  it('rejects members from another city', async () => {
    const batchId = await createBatch(db, nextDate())
    const local = await createUser(db)
    const remote = await createUser(db, {
      cityKey: 'ca:british columbia:vancouver',
      timezone: 'America/Vancouver',
    })
    const members = await membersFor([local, remote])
    await expect(
      commit(db, await createProposal(db, { batchId, members, startIso: start, endIso: end }), now),
    ).rejects.toThrow(/city_mismatch/)
  })

  it('fills a cross-midnight slot only once', async () => {
    const [a, b, c] = await users(3)
    const first = await createBatch(db, '2026-10-20')
    // a's slot runs 22:00 Oct 20 to 02:00 Oct 21 local (02:00Z to 06:00Z Oct 21).
    const aSlot = await createSlot(db, a!, '2026-10-21T02:00:00Z', '2026-10-21T06:00:00Z')
    const bSlot = await createSlot(db, b!, '2026-10-21T02:00:00Z', '2026-10-21T04:00:00Z')
    const firstProposal = await createProposal(db, {
      batchId: first,
      members: [
        { user_id: a!, slot_id: aSlot.id, revision: aSlot.revision },
        { user_id: b!, slot_id: bSlot.id, revision: bSlot.revision },
      ],
      startIso: '2026-10-21T02:00:00Z',
      endIso: '2026-10-21T03:00:00Z',
    })
    await expect(commit(db, firstProposal, '2026-10-18T00:00:00Z')).resolves.toBeDefined()

    const second = await createBatch(db, '2026-10-21')
    const cSlot = await createSlot(db, c!, '2026-10-21T04:00:00Z', '2026-10-21T06:00:00Z')
    const secondProposal = await createProposal(db, {
      batchId: second,
      members: [
        { user_id: a!, slot_id: aSlot.id, revision: aSlot.revision },
        { user_id: c!, slot_id: cSlot.id, revision: cSlot.revision },
      ],
      startIso: '2026-10-21T04:30:00Z',
      endIso: '2026-10-21T05:30:00Z',
    })
    await expect(commit(db, secondProposal, '2026-10-18T00:00:00Z')).rejects.toThrow(/stale_slot/)
  })

  it('allows one event per person per local date even across separate slots', async () => {
    const batchId = await createBatch(db, nextDate())
    const localDate = (
      await db.query<{ d: string }>(
        'select local_date::text as d from planning_batches where id = $1',
        [batchId],
      )
    )[0]!.d
    const [a, b, c] = await users(3)
    const early = await membersFor([a!, b!], `${localDate}T14:00:00Z`, `${localDate}T16:00:00Z`)
    await expect(
      commit(
        db,
        await createProposal(db, {
          batchId,
          members: early,
          startIso: `${localDate}T14:00:00Z`,
          endIso: `${localDate}T15:00:00Z`,
        }),
        `${localDate.slice(0, 8)}01T00:00:00Z`,
      ),
    ).resolves.toBeDefined()
    const late = await membersFor([a!, c!], `${localDate}T20:00:00Z`, `${localDate}T22:00:00Z`)
    await expect(
      commit(
        db,
        await createProposal(db, {
          batchId,
          members: late,
          startIso: `${localDate}T20:00:00Z`,
          endIso: `${localDate}T21:00:00Z`,
        }),
        `${localDate.slice(0, 8)}01T00:00:00Z`,
      ),
    ).rejects.toThrow(/booking_conflict/)
  })

  it('refuses proposals that are not planned', async () => {
    const batchId = await createBatch(db, nextDate())
    const members = await membersFor(await users(2))
    const proposed = await createProposal(db, {
      batchId,
      members,
      startIso: start,
      endIso: end,
      status: 'proposed',
      plan: null,
    })
    await expect(commit(db, proposed, now)).rejects.toThrow(/proposal_not_ready/)
    await expect(commit(db, 'missing', now)).rejects.toThrow(/proposal_not_found/)
  })
})
