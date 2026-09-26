import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeAiProvider } from '@/features/ai/fake'
import type { AiProvider } from '@/features/ai/provider'
import { fakePushSender } from '@/features/push/fake'
import type { Db } from '@/lib/db'
import type { Providers } from '@/lib/providers'
import { hour, minute, zonedTime } from '@/lib/time'
import {
  count,
  createSlot,
  createTestDb,
  createUser,
  toronto,
} from '../../../../supabase/tests/harness'
import { fictionalVenueProvider } from '../venues/fictional'
import type { VenueProvider } from '../venues/provider'
import { type DriverDeps, runPlanningTick } from './driver'

// Monday 2026-09-28 just after midnight in Toronto; the main batch targets Wednesday.
const mondayMidnight = zonedTime(toronto.timezone, '2026-09-28')
const wednesday = '2026-09-30'
const at = (h: number, m = 0) =>
  new Date(zonedTime(toronto.timezone, wednesday, h, m)).toISOString()

let db: Db
let clock = mondayMidnight + 5 * minute
let providers: Providers

function deps(overrides: Partial<Providers> = {}): DriverDeps {
  return { db, providers: { ...providers, ...overrides }, workerId: 'test', clock: () => clock }
}

async function personWithSlot(start: string, end: string, interests = ['coffee']): Promise<string> {
  const userId = await createUser(db, { interests })
  await createSlot(db, userId, start, end)
  return userId
}

beforeEach(async () => {
  db = await createTestDb()
  clock = mondayMidnight + 5 * minute
  providers = { ai: fakeAiProvider(), venues: fictionalVenueProvider(), push: fakePushSender() }
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('runPlanningTick', () => {
  it('books a group at the main batch, is idempotent, and picks up late arrivals in catch-up', async () => {
    const people = [] as string[]
    for (let i = 0; i < 4; i += 1) people.push(await personWithSlot(at(18), at(21)))
    const tooShort = await personWithSlot(at(20, 30), at(21, 15))
    await db.query(
      "insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://push/one', 'k', 'a')",
      [people[0]],
    )

    const first = await runPlanningTick(deps())
    expect(first.batches).toHaveLength(1)
    expect(first.batches[0]).toMatchObject({
      cityKey: toronto.cityKey,
      localDate: wednesday,
      pass: 1,
      status: 'done',
    })
    expect(first.batches[0]!.groups.map((g) => g.status)).toEqual(['committed'])
    expect(await count(db, 'events')).toBe(1)
    const event = (
      await db.query<{ starts_at: Date; venue: { provider: string }; explanation: string }>(
        'select starts_at, venue, explanation from events',
      )
    )[0]!
    expect(event.starts_at.toISOString()).toBe(at(18))
    expect(event.venue.provider).toBe('fictional')
    expect(event.explanation).toContain('coffee')
    expect(await count(db, 'event_participants')).toBe(4)
    expect(await count(db, 'availability_slots', "status = 'filled'")).toBe(4)
    expect(
      await count(db, 'availability_slots', "status = 'pending' and user_id = $1", [tooShort]),
    ).toBe(1)
    expect(first.notifications).toMatchObject({ claimed: 4, done: 4 })
    expect((providers.push as ReturnType<typeof fakePushSender>).sent).toHaveLength(1)
    const batch = (
      await db.query<{ snapshot: unknown }>('select snapshot from planning_batches')
    )[0]!
    expect(batch.snapshot).not.toBeNull()

    clock += minute
    const second = await runPlanningTick(deps())
    expect(second.batches).toEqual([])
    expect(await count(db, 'events')).toBe(1)

    clock = mondayMidnight + 70 * minute
    const third = await runPlanningTick(deps())
    expect(third.batches[0]).toMatchObject({ pass: 2, status: 'done', groups: [] })

    await personWithSlot(at(19), at(21))
    await personWithSlot(at(19), at(21))
    clock = mondayMidnight + 135 * minute
    const fourth = await runPlanningTick(deps())
    expect(fourth.batches[0]!.groups.map((g) => g.status)).toEqual(['committed'])
    expect(await count(db, 'events')).toBe(2)
    expect(await count(db, 'user_date_assignments')).toBe(6)
  })

  it('leaves slots pending when no venue fits and stops retrying those people after two failures', async () => {
    await personWithSlot(at(18), at(20))
    await personWithSlot(at(18), at(20))
    const noVenues: VenueProvider = { kind: 'fictional', search: async () => [] }
    const first = await runPlanningTick(deps({ venues: noVenues }))
    expect(first.batches[0]!.groups).toEqual([
      { planningId: expect.any(String), status: 'failed', error: 'no_venue' },
    ])
    expect(await count(db, 'events')).toBe(0)
    expect(await count(db, 'availability_slots', "status = 'pending'")).toBe(2)

    clock = mondayMidnight + 70 * minute
    const second = await runPlanningTick(deps({ venues: noVenues }))
    expect(second.batches[0]!.groups.map((g) => g.status)).toEqual(['failed'])
    expect(await count(db, 'planning_proposals', "status = 'failed'")).toBe(2)

    clock = mondayMidnight + 135 * minute
    const third = await runPlanningTick(deps())
    expect(third.batches[0]!.groups).toEqual([])
  })

  it('falls back to catalog ranking when the model fails and rejects a stale commit', async () => {
    const a = await personWithSlot(at(18), at(20), ['climbing'])
    await personWithSlot(at(18), at(20), ['climbing'])
    const brokenAi: AiProvider = {
      ...fakeAiProvider(),
      rankActivities: async () => {
        throw new Error('model down')
      },
    }
    const summary = await runPlanningTick(deps({ ai: brokenAi }))
    expect(summary.batches[0]!.groups[0]!.status).toBe('committed')
    expect(
      (await db.query<{ activity_id: string }>('select activity_id from events'))[0]!.activity_id,
    ).toBe('bouldering')

    // A person edits their slot after planning but before commit: the revision no longer matches.
    await db.query("update events set status = 'cancelled' where true")
    await db.exec('delete from user_date_assignments; delete from participant_reservations')
    await db.query(
      "update availability_slots set status = 'pending', assigned_event_id = null, revision = revision + 1 where user_id = $1",
      [a],
    )
    const stalePlanning = (
      await db.query<{ planning_id: string; plan: Record<string, unknown> }>(
        'select planning_id, plan from planning_proposals',
      )
    )[0]!
    await db.query(
      "insert into planning_proposals (planning_id, batch_id, pass, members, shared_start, shared_end, plan, status) select 'stale-copy', batch_id, pass, members, shared_start, shared_end, plan, 'planned' from planning_proposals where planning_id = $1",
      [stalePlanning.planning_id],
    )
    await db.query("update planning_batches set status = 'running', lease_expires_at = null")
    clock += minute
    const recovery = await runPlanningTick(deps())
    expect(recovery.batches[0]!.groups.find((g) => g.planningId === 'stale-copy')).toMatchObject({
      status: 'failed',
      error: 'stale_slot',
    })
  })

  it('recovers a planned proposal left behind by a crash', async () => {
    const a = await personWithSlot(at(18), at(20))
    const b = await personWithSlot(at(18), at(20))
    const slots = await db.query<{ id: string; user_id: string; revision: number }>(
      'select id, user_id, revision from availability_slots order by user_id',
    )
    const batchRows = await db.query<{ id: string }>(
      `insert into planning_batches (city_key, timezone, local_date, status, pass, attempts, scoring_time)
       values ($1, $2, $3::date, 'running', 1, 1, $4::timestamptz) returning id`,
      [toronto.cityKey, toronto.timezone, wednesday, new Date(clock).toISOString()],
    )
    const members = slots.map((s) => ({ user_id: s.user_id, slot_id: s.id, revision: s.revision }))
    const plan = {
      activity_id: 'coffee',
      activity_name: 'Coffee and conversation',
      duration_minutes: 60,
      explanation: 'x',
      venue: {
        provider: 'fictional',
        place_id: 'd',
        name: '(Demo) Cafe',
        address: 'a',
        lat: 1,
        lng: 2,
        hours_verified: false,
      },
      starts_at: at(18),
      ends_at: at(19),
    }
    await db.query(
      `insert into planning_proposals (planning_id, batch_id, pass, members, shared_start, shared_end, plan, status)
       values ('crashed', $1, 1, $2::jsonb, $3::timestamptz, $4::timestamptz, $5::jsonb, 'planned')`,
      [batchRows[0]!.id, JSON.stringify(members), at(18), at(20), JSON.stringify(plan)],
    )
    const summary = await runPlanningTick(deps())
    expect(summary.batches[0]!.groups).toEqual([
      { planningId: 'crashed', status: 'committed', eventId: expect.any(String) },
    ])
    expect(await count(db, 'event_participants', 'user_id = any($1::uuid[])', [[a, b]])).toBe(2)
  })

  it('expires dead slots on every tick', async () => {
    const user = await createUser(db)
    await createSlot(
      db,
      user,
      new Date(clock + 40 * hour).toISOString(),
      new Date(clock + 42 * hour).toISOString(),
    )
    const summary = await runPlanningTick(deps())
    expect(summary.expiredSlots).toBe(1)
  })
})
