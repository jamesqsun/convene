import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeCalendarProvider } from '@/features/calendar/fake'
import { saveConnection } from '@/features/calendar/store'
import { syncUserCalendar } from '@/features/calendar/sync'
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
  return {
    db,
    providers: { ...providers, ...overrides },
    workerId: 'test',
    clock: () => clock,
    tokenSecret: 'x'.repeat(32),
  }
}

async function personWithSlot(start: string, end: string, interests = ['coffee']): Promise<string> {
  const userId = await createUser(db, { interests })
  await createSlot(db, userId, start, end)
  return userId
}

beforeEach(async () => {
  db = await createTestDb()
  clock = mondayMidnight + 5 * minute
  providers = {
    ai: fakeAiProvider(),
    venues: fictionalVenueProvider(),
    push: fakePushSender(),
    calendar: fakeCalendarProvider(),
  }
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('runPlanningTick', () => {
  it('manually plans future dates, bypasses catch-up delay, and preserves leases and cutoff', async () => {
    const future = (h: number) =>
      new Date(zonedTime(toronto.timezone, '2026-10-05', h)).toISOString()
    await personWithSlot(future(18), future(21))
    await personWithSlot(future(18), future(21))
    await personWithSlot(at(18), at(21))
    await personWithSlot(at(18), at(21))
    await runPlanningTick(deps())
    expect(await count(db, 'events')).toBe(1)
    await personWithSlot(at(18), at(21))
    await personWithSlot(at(18), at(21))
    const early = new Date(clock + hour).toISOString()
    const earlyEnd = new Date(clock + 3 * hour).toISOString()
    await personWithSlot(early, earlyEnd)
    await personWithSlot(early, earlyEnd)
    const manual = await runPlanningTick(deps(), { allBatches: true })
    expect(manual.batches.map((batch) => batch.localDate)).toEqual([wednesday, '2026-10-05'])
    expect(await count(db, 'events')).toBe(3)
    await runPlanningTick(deps(), { allBatches: true })
    expect(await count(db, 'events')).toBe(3)
    await db.query("update planning_batches set status = 'running', lease_expires_at = $1", [
      new Date(clock + hour).toISOString(),
    ])
    expect((await runPlanningTick(deps(), { allBatches: true })).batches).toEqual([])
  })
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

  it('subtracts cached busy time and refuses to book over a live calendar conflict', async () => {
    const provider = fakeCalendarProvider()
    const tokenSecret = 'x'.repeat(32)
    const tokens = {
      refreshToken: 'r',
      accessToken: 'a',
      expiresAt: clock + hour,
      email: 'you@gmail.demo',
    }
    // Both people are free 18:00 to 21:00 Wednesday, but one has a cached 18:00 to 18:30 meeting on
    // their work calendar, which is the only calendar they selected.
    const busyPerson = await personWithSlot(at(18), at(21))
    await personWithSlot(at(18), at(21))
    await saveConnection(db, busyPerson, 'fake', tokens, tokenSecret)
    await syncUserCalendar({ db, provider, tokenSecret }, busyPerson, clock)
    await db.query(
      "update calendar_sources set is_selected = (calendar_id = 'work') where user_id = $1",
      [busyPerson],
    )
    await db.query(
      "insert into busy_blocks (user_id, calendar_id, external_id, summary, starts_at, ends_at) values ($1, 'work', 'late-standup', 'Standup', $2::timestamptz, $3::timestamptz)",
      [busyPerson, at(18), at(18, 30)],
    )
    const first = await runPlanningTick(deps({ calendar: provider }))
    expect(first.batches[0]!.groups.map((g) => g.status)).toEqual(['committed'])
    const event = (await db.query<{ starts_at: Date }>('select starts_at from events'))[0]!
    expect(event.starts_at.toISOString()).toBe(at(18, 30))
    expect(first.calendars).toMatchObject({ entriesCreated: 1 })
    expect(provider.writtenEvents).toHaveLength(1)

    // A second pair: a meeting lands on one person's calendar after the cache was refreshed, so only
    // the live check before booking can see it.
    const lateBooker = await personWithSlot(at(20), at(22))
    await personWithSlot(at(20), at(22))
    await saveConnection(db, lateBooker, 'fake', tokens, tokenSecret)
    clock = mondayMidnight + 70 * minute
    await syncUserCalendar({ db, provider, tokenSecret }, lateBooker, clock)
    const liveOnly = {
      ...provider,
      listBusy: async () => [
        {
          calendarId: 'primary',
          externalId: 'late',
          summary: 'Last-minute call',
          startsAt: Date.parse(at(20)),
          endsAt: Date.parse(at(21)),
          isAllDay: false,
        },
      ],
    }
    const second = await runPlanningTick(deps({ calendar: liveOnly }))
    expect(second.batches[0]!.groups.map((g) => g.error)).toEqual(['calendar_conflict'])
    expect(await count(db, 'events')).toBe(1)
  })

  it('carries availability forward before planning', async () => {
    const userId = await createUser(db)
    const lastWednesday = zonedTime(toronto.timezone, '2026-09-23')
    await createSlot(
      db,
      userId,
      new Date(lastWednesday + 18 * hour).toISOString(),
      new Date(lastWednesday + 21 * hour).toISOString(),
    )
    await db.query(
      "insert into availability_weeks (user_id, week_start, status) values ($1, '2026-09-21', 'confirmed')",
      [userId],
    )
    const summary = await runPlanningTick(deps())
    expect(summary.weeksCarriedForward).toBe(1)
    expect(
      await count(
        db,
        'availability_slots',
        "user_id = $1 and status = 'pending' and starts_at = $2::timestamptz",
        [userId, at(18)],
      ),
    ).toBe(1)
  })
})
