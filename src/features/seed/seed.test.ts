import { beforeAll, describe, expect, it } from 'vitest'
import { loadHangouts } from '@/features/events/read'
import { fakeCalendarProvider } from '@/features/calendar/fake'
import { fakeAiProvider } from '@/features/ai/fake'
import { loadHistorySnapshot } from '@/features/planning/batch/history'
import { pairKey } from '@/features/planning/buckets/reconnection'
import type { Db } from '@/lib/db'
import { zonedTime } from '@/lib/time'
import { createTestDb } from '../../../supabase/tests/harness'
import { generatedPastEvents, generatedPeople } from './generate'
import { personas, seedFriendships } from './people'
import { seedDemoWorld } from './seed'

let db: Db
const now = zonedTime('America/Toronto', '2026-09-28', 0) + 5 * 60_000

beforeAll(async () => {
  db = await createTestDb()
})

describe('seedDemoWorld', () => {
  it('creates personas, memories, availability, and history idempotently', async () => {
    const calendar = { provider: fakeCalendarProvider(), tokenSecret: 'x'.repeat(32) }
    const first = await seedDemoWorld(db, fakeAiProvider(), { now, calendar })
    expect(first).toEqual({ people: 12, slots: 22, historyEvents: 2, calendarsConnected: 2 })
    const second = await seedDemoWorld(db, fakeAiProvider(), { now, calendar })
    expect(second.historyEvents).toBe(0)
    expect(
      (await db.query<{ n: number }>('select count(*)::int as n from calendar_connections'))[0]!.n,
    ).toBe(2)
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::int as n from availability_weeks where status = 'confirmed'",
        )
      )[0]!.n,
    ).toBeGreaterThan(0)
    expect((await db.query<{ n: number }>('select count(*)::int as n from profiles'))[0]!.n).toBe(
      12,
    )
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::int as n from availability_slots where status = 'pending'",
        )
      )[0]!.n,
    ).toBe(22)
    expect(
      (
        await db.query<{ n: number }>(
          'select count(*)::int as n from profiles where onboarding_completed_at is null',
        )
      )[0]!.n,
    ).toBe(1)
    expect(
      (
        await db.query<{ n: number }>(
          'select count(*)::int as n from preference_memories where embedding is null',
        )
      )[0]!.n,
    ).toBe(0)
  })

  it('gives Maya two completed hangouts, two friendships, and mutual-yes eligibility with Ben and Dev', async () => {
    const hangouts = await loadHangouts(db, seedFriendships.maya, now)
    expect(hangouts.map((h) => h.activityName)).toEqual(['Board game cafe', 'Walk in the park'])
    const snapshot = await loadHistorySnapshot(
      db,
      [seedFriendships.maya, seedFriendships.ben, seedFriendships.chloe, seedFriendships.dev],
      now,
    )
    expect(Object.keys(snapshot.friendships).sort()).toEqual(
      [
        pairKey(seedFriendships.maya, seedFriendships.ben),
        pairKey(seedFriendships.maya, seedFriendships.dev),
      ].sort(),
    )
    expect(
      snapshot.history[pairKey(seedFriendships.maya, seedFriendships.dev)]!.isMutualYesOnLatest,
    ).toBe(true)
    expect(hangouts[0]!.people.find((p) => p.name.startsWith('Chloe'))).toMatchObject({
      myAnswer: 'no',
      isMutualFriend: false,
    })
  })

  it('seeds generated people and their history beside the cast, idempotently', async () => {
    const people = generatedPeople(30)
    const pastEvents = generatedPastEvents(people, 10)
    const count = async (sql: string) => (await db.query<{ n: number }>(sql))[0]!.n
    const friendshipsBefore = await count('select count(*)::int as n from friendships')

    const first = await seedDemoWorld(db, fakeAiProvider(), { now, people, pastEvents })
    expect(first).toEqual({ people: 30, slots: 60, historyEvents: 10, calendarsConnected: 0 })
    expect(await count('select count(*)::int as n from profiles')).toBe(42)
    expect(
      await count(
        'select count(*)::int as n from profiles where onboarding_completed_at is not null',
      ),
    ).toBe(41)
    expect(await count('select count(*)::int as n from events')).toBe(12)
    expect(await count('select count(*)::int as n from friendships')).toBeGreaterThan(
      friendshipsBefore,
    )
    expect(
      await count('select count(*)::int as n from preference_memories where embedding is null'),
    ).toBe(0)
    expect(
      await count(
        "select count(*)::int as n from events where timezone = 'America/Vancouver' and venue->>'address' like '%Vancouver%'",
      ),
    ).toBeGreaterThan(0)

    const second = await seedDemoWorld(db, fakeAiProvider(), { now, people, pastEvents })
    expect(second).toMatchObject({ people: 30, slots: 60, historyEvents: 0 })
    expect(await count('select count(*)::int as n from profiles')).toBe(42)
    expect(
      await count("select count(*)::int as n from availability_slots where status = 'pending'"),
    ).toBe(82)
  })

  it('returns a mid-onboarding persona to that state after someone finished onboarding as them', async () => {
    const ivy = personas.find((persona) => !persona.isOnboarded)!
    await db.query(
      `update profiles set city_key = 'us:georgia:atlanta', city_name = 'Atlanta', city_timezone = 'America/New_York',
         city_lat = 33.75, city_lng = -84.39, phone_e164 = '+14045550199', onboarding_completed_at = now()
       where id = $1`,
      [ivy.id],
    )
    const maya = await db.query<{ at: Date }>(
      'select onboarding_completed_at as at from profiles where id = $1',
      [seedFriendships.maya],
    )

    await seedDemoWorld(db, fakeAiProvider(), { now })

    expect(
      await db.query(
        'select city_key, phone_e164, onboarding_completed_at from profiles where id = $1',
        [ivy.id],
      ),
    ).toEqual([{ city_key: null, phone_e164: null, onboarding_completed_at: null }])
    expect(
      await db.query('select onboarding_completed_at as at from profiles where id = $1', [
        seedFriendships.maya,
      ]),
    ).toEqual(maya)
  })

  it('keeps every persona fictional and phone numbers in the 555 range', () => {
    expect(personas.every((p) => p.email.endsWith('@convene.demo'))).toBe(true)
    expect(personas.every((p) => /^\+1(416|604)555\d{4}$/.test(p.phone))).toBe(true)
  })
})
