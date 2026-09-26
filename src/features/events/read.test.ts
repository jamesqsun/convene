import { beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '@/lib/db'
import { backdateEvent, bookGroup, createTestDb, createUser } from '../../../supabase/tests/harness'
import { loadHangouts, loadPlan, loadPlans } from './read'

let db: Db
let a: string
let b: string
let c: string
let eventId: string
const now = Date.parse('2026-10-01T12:00:00Z')

beforeAll(async () => {
  db = await createTestDb()
  a = await createUser(db, { name: 'Ann', phone: '+14165550001', interests: ['coffee'] })
  b = await createUser(db, { name: 'Ben', phone: '+14165550002', interests: ['coffee', 'art'] })
  c = await createUser(db, { name: 'Cam', phone: '+14165550003' })
  eventId = (
    await bookGroup(db, {
      localDate: '2026-10-03',
      startIso: '2026-10-03T22:00:00Z',
      endIso: '2026-10-03T23:00:00Z',
      nowIso: '2026-10-01T00:00:00Z',
      users: [a, b, c],
    })
  ).eventId
})

describe('plan reads', () => {
  it('shows a participant the plan with co-participant phones and interests', async () => {
    const plan = (await loadPlan(db, a, eventId, now))!
    expect(plan).toMatchObject({
      status: 'scheduled',
      activity: { id: 'coffee', name: 'Coffee', durationMinutes: 60 },
      canWithdraw: true,
    })
    expect(plan.venue).toMatchObject({
      provider: 'fictional',
      name: '(Demo) Cafe',
      hoursVerified: false,
    })
    expect(plan.calendarStatus).toBeNull()
    await db.query(
      "insert into event_calendar_entries (event_id, user_id, calendar_id, external_event_id, status) values ($1, $2, 'convene-demo', 'x', 'created')",
      [eventId, a],
    )
    expect((await loadPlan(db, a, eventId, now))!.calendarStatus).toBe('created')
    expect((await loadPlan(db, b, eventId, now))!.calendarStatus).toBeNull()
    expect(plan.participants.map((p) => [p.name, p.phone])).toEqual([
      ['Ann', '+14165550001'],
      ['Ben', '+14165550002'],
      ['Cam', '+14165550003'],
    ])
    expect((await loadPlans(db, a, now)).map((p) => p.eventId)).toEqual([eventId])
    expect(await loadPlan(db, await createUser(db), eventId, now)).toBeNull()
  })

  it('hides withdrawn people, revokes the leaver’s access, and drops phones once cancelled', async () => {
    await db.query('select withdraw_participant($1, $2, $3::timestamptz)', [
      eventId,
      c,
      '2026-10-02T00:00:00Z',
    ])
    expect(await loadPlan(db, c, eventId, now)).toBeNull()
    expect((await loadPlan(db, a, eventId, now))!.participants.map((p) => p.name)).toEqual([
      'Ann',
      'Ben',
    ])
    await db.query('select withdraw_participant($1, $2, $3::timestamptz)', [
      eventId,
      b,
      '2026-10-02T00:00:00Z',
    ])
    const cancelled = (await loadPlan(db, a, eventId, now))!
    expect(cancelled.status).toBe('cancelled')
    expect(cancelled.canWithdraw).toBe(false)
    expect(cancelled.participants.map((p) => p.phone)).toEqual([null])
    expect(await loadHangouts(db, a, Date.parse('2026-12-01T00:00:00Z'))).toEqual([])
  })

  it('lists completed hangouts with only the viewer’s answers and mutual friendship', async () => {
    const x = await createUser(db, { name: 'Xia' })
    const y = await createUser(db, { name: 'Yan' })
    const z = await createUser(db, { name: 'Zed' })
    const completed = (
      await bookGroup(db, {
        localDate: '2026-10-05',
        startIso: '2026-10-05T22:00:00Z',
        endIso: '2026-10-05T23:00:00Z',
        nowIso: '2026-10-01T00:00:00Z',
        users: [x, y, z],
      })
    ).eventId
    await backdateEvent(db, completed, '2026-10-05T23:00:00Z')
    const later = '2026-10-06T12:00:00Z'
    await db.query('select submit_feedback($1, $2, $3, true, $4::timestamptz)', [
      completed,
      x,
      y,
      later,
    ])
    await db.query('select submit_feedback($1, $2, $3, true, $4::timestamptz)', [
      completed,
      y,
      x,
      later,
    ])
    await db.query('select submit_feedback($1, $2, $3, false, $4::timestamptz)', [
      completed,
      z,
      x,
      later,
    ])
    const [hangout] = await loadHangouts(db, x, Date.parse(later))
    expect(hangout).toMatchObject({
      eventId: completed,
      activityName: 'Coffee',
      venueName: '(Demo) Cafe',
    })
    expect(hangout!.people).toEqual([
      { userId: y, name: 'Yan', interests: ['coffee'], myAnswer: 'yes', isMutualFriend: true },
      { userId: z, name: 'Zed', interests: ['coffee'], myAnswer: null, isMutualFriend: false },
    ])
    expect(JSON.stringify(hangout)).not.toContain('+1416')
  })
})
