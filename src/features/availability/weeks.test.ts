import { beforeAll, describe, expect, it } from 'vitest'
import { saveConnection } from '@/features/calendar/store'
import { syncUserCalendar } from '@/features/calendar/sync'
import { fakeCalendarProvider } from '@/features/calendar/fake'
import type { Db } from '@/lib/db'
import { hour, zonedTime } from '@/lib/time'
import { count, createTestDb, createUser } from '../../../supabase/tests/harness'
import {
  isWeekStart,
  loadWeek,
  materializeWeeks,
  rangesToWindows,
  saveWeek,
  weekStartOf,
  windowsToRanges,
} from './weeks'

let db: Db
const tz = 'America/Toronto'
// Monday 2026-09-28, 08:00 local.
const now = zonedTime(tz, '2026-09-28', 8)
const thisWeek = '2026-09-28'
const nextWeek = '2026-10-05'

beforeAll(async () => {
  db = await createTestDb()
})

describe('week arithmetic', () => {
  it('finds the Monday of a week and validates week starts', () => {
    expect(weekStartOf(tz, zonedTime(tz, '2026-10-04', 23))).toBe('2026-09-28')
    expect(weekStartOf(tz, zonedTime(tz, '2026-10-05', 0))).toBe('2026-10-05')
    expect(isWeekStart(tz, '2026-10-05')).toBe(true)
    expect(isWeekStart(tz, '2026-10-06')).toBe(false)
  })

  it('converts windows to merged ranges and back, including midnight ends', () => {
    const ranges = windowsToRanges(
      thisWeek,
      [
        { day: 5, start: '18:00', end: '20:00' },
        { day: 5, start: '19:30', end: '24:00' },
        { day: 0, start: '09:00', end: '10:00' },
      ],
      tz,
    )
    expect(ranges).toEqual([
      { start: zonedTime(tz, '2026-09-28', 9), end: zonedTime(tz, '2026-09-28', 10) },
      { start: zonedTime(tz, '2026-10-03', 18), end: zonedTime(tz, '2026-10-04', 0) },
    ])
    expect(rangesToWindows(thisWeek, ranges, tz)).toEqual([
      { day: 0, start: '09:00', end: '10:00' },
      { day: 5, start: '18:00', end: '24:00' },
    ])
    expect(() => windowsToRanges(thisWeek, [{ day: 1, start: '18:00', end: '18:30' }], tz)).toThrow(
      /one hour/,
    )
    expect(() => windowsToRanges(thisWeek, [{ day: 7, start: '18:00', end: '20:00' }], tz)).toThrow(
      /Day/,
    )
    expect(() => windowsToRanges(thisWeek, [{ day: 1, start: '20:00', end: '18:00' }], tz)).toThrow(
      /end after/,
    )
  })
})

describe('saveWeek and loadWeek', () => {
  it('creates, keeps, replaces, skips too-soon windows, and never touches filled slots', async () => {
    const userId = await createUser(db)
    const partner = await createUser(db)
    const first = await saveWeek(
      db,
      userId,
      thisWeek,
      [
        { day: 0, start: '18:00', end: '20:00' },
        { day: 4, start: '18:00', end: '21:00' },
        { day: 5, start: '10:00', end: '12:00' },
      ],
      tz,
      now,
    )
    expect(first).toEqual({ created: 2, kept: 0, removed: 0, skippedTooSoon: 1 })
    let view = await loadWeek(db, userId, thisWeek, tz, now)
    expect(view.status).toBe('confirmed')
    expect(view.slots.map((s) => s.state)).toEqual(['waiting', 'waiting'])

    const fridaySlot = view.slots.find((s) => s.startsAt === zonedTime(tz, '2026-10-02', 18))!
    const partnerSlot = await db.query<{ id: string; revision: number }>(
      `insert into availability_slots (user_id, "window", timezone) values ($1, tstzrange($2::timestamptz, $3::timestamptz, '[)'), $4) returning id, revision`,
      [
        partner,
        new Date(zonedTime(tz, '2026-10-02', 18)).toISOString(),
        new Date(zonedTime(tz, '2026-10-02', 21)).toISOString(),
        tz,
      ],
    )
    const batch = await db.query<{ id: string }>(
      `insert into planning_batches (city_key, timezone, local_date, status, pass, attempts, scoring_time) values ('ca:ontario:toronto', $1, '2026-10-02', 'running', 1, 1, $2::timestamptz) returning id`,
      [tz, new Date(now).toISOString()],
    )
    const plan = {
      activity_id: 'coffee',
      activity_name: 'Coffee',
      duration_minutes: 60,
      explanation: '',
      venue: {
        provider: 'fictional',
        place_id: 'd',
        name: 'Cafe',
        address: 'a',
        lat: 1,
        lng: 2,
        hours_verified: false,
      },
      starts_at: new Date(zonedTime(tz, '2026-10-02', 18)).toISOString(),
      ends_at: new Date(zonedTime(tz, '2026-10-02', 19)).toISOString(),
    }
    await db.query(
      `insert into planning_proposals (planning_id, batch_id, pass, members, shared_start, shared_end, plan, status) values ('w1', $1, 1, $2::jsonb, $3::timestamptz, $4::timestamptz, $5::jsonb, 'planned')`,
      [
        batch[0]!.id,
        JSON.stringify([
          { user_id: userId, slot_id: fridaySlot.id, revision: fridaySlot.revision },
          { user_id: partner, slot_id: partnerSlot[0]!.id, revision: partnerSlot[0]!.revision },
        ]),
        plan.starts_at,
        plan.ends_at,
        JSON.stringify(plan),
      ],
    )
    await db.query('select commit_group_event($1, $2::timestamptz)', [
      'w1',
      new Date(now).toISOString(),
    ])

    const second = await saveWeek(
      db,
      userId,
      thisWeek,
      [
        { day: 4, start: '17:00', end: '22:00' },
        { day: 6, start: '10:00', end: '12:00' },
      ],
      tz,
      now,
    )
    expect(second).toEqual({ created: 1, kept: 1, removed: 1, skippedTooSoon: 0 })
    view = await loadWeek(db, userId, thisWeek, tz, now)
    expect(view.slots.map((s) => [s.state, s.startsAt])).toEqual([
      ['assigned', zonedTime(tz, '2026-10-02', 18)],
      ['waiting', zonedTime(tz, '2026-10-04', 10)],
    ])
    expect(view.events).toHaveLength(1)
    expect(
      await count(db, 'availability_slots', "user_id = $1 and status = 'cancelled'", [userId]),
    ).toBe(1)
  })

  it('includes busy blocks from the connected calendar', async () => {
    const userId = await createUser(db)
    await saveConnection(
      db,
      userId,
      'fake',
      { refreshToken: 'r', accessToken: 'a', expiresAt: now + hour, email: 'x' },
      'test-token-secret-test-token-secret-1234',
    )
    await syncUserCalendar(
      {
        db,
        provider: fakeCalendarProvider(),
        tokenSecret: 'test-token-secret-test-token-secret-1234',
      },
      userId,
      now,
    )
    const view = await loadWeek(db, userId, nextWeek, tz, now)
    expect(view.busy.some((b) => b.summary === 'Work')).toBe(true)
    expect(view.dayStarts).toHaveLength(8)
    expect(view.status).toBe('none')
  })
})

describe('materializeWeeks', () => {
  it('copies the most recent week forward for repeating people only, once', async () => {
    const repeating = await createUser(db)
    const optedOut = await createUser(db)
    const blank = await createUser(db)
    // Only this test's people should repeat; earlier tests in this file created others.
    await db.query('update profiles set is_repeating_availability = (id = $1)', [repeating])
    for (const userId of [repeating, optedOut]) {
      await saveWeek(
        db,
        userId,
        thisWeek,
        [
          { day: 4, start: '18:00', end: '21:00' },
          { day: 6, start: '10:00', end: '13:00' },
        ],
        tz,
        now,
      )
    }
    // Saturday 2026-10-03: the planner targets Monday 2026-10-05, the following week.
    const saturday = zonedTime(tz, '2026-10-03', 0) + 5 * 60_000
    expect(await materializeWeeks(db, saturday)).toEqual({ weeks: 1, slots: 2 })
    const view = await loadWeek(db, repeating, nextWeek, tz, saturday)
    expect(view).toMatchObject({ status: 'auto', copiedFrom: thisWeek })
    expect(view.slots.map((s) => s.startsAt)).toEqual([
      zonedTime(tz, '2026-10-09', 18),
      zonedTime(tz, '2026-10-11', 10),
    ])
    expect((await loadWeek(db, optedOut, nextWeek, tz, saturday)).slots).toEqual([])
    expect((await loadWeek(db, blank, nextWeek, tz, saturday)).status).toBe('none')
    expect(await materializeWeeks(db, saturday)).toEqual({ weeks: 0, slots: 0 })

    // The person edits the auto week: it becomes confirmed and the chain continues from it.
    await saveWeek(
      db,
      repeating,
      nextWeek,
      [{ day: 2, start: '19:00', end: '21:00' }],
      tz,
      saturday,
    )
    const nextSaturday = zonedTime(tz, '2026-10-10', 0) + 5 * 60_000
    expect(await materializeWeeks(db, nextSaturday)).toEqual({ weeks: 1, slots: 1 })
    const following = await loadWeek(db, repeating, '2026-10-12', tz, nextSaturday)
    expect(following.copiedFrom).toBe(nextWeek)
    expect(following.slots.map((s) => s.startsAt)).toEqual([zonedTime(tz, '2026-10-14', 19)])
  })
})
