import { beforeAll, describe, expect, it } from 'vitest'
import { loadHangouts } from '@/features/events/read'
import { fakeAiProvider } from '@/features/ai/fake'
import { loadHistorySnapshot } from '@/features/planning/batch/history'
import { pairKey } from '@/features/planning/buckets/reconnection'
import type { Db } from '@/lib/db'
import { zonedTime } from '@/lib/time'
import { createTestDb } from '../../../supabase/tests/harness'
import { personas, seedFriendships } from './people'
import { seedDemoWorld } from './seed'

let db: Db
const now = zonedTime('America/Toronto', '2026-09-28', 0) + 5 * 60_000

beforeAll(async () => {
  db = await createTestDb()
})

describe('seedDemoWorld', () => {
  it('creates personas, memories, availability, and history idempotently', async () => {
    const first = await seedDemoWorld(db, fakeAiProvider(), { now })
    expect(first).toEqual({ people: 12, slots: 22, historyEvents: 2 })
    const second = await seedDemoWorld(db, fakeAiProvider(), { now })
    expect(second.historyEvents).toBe(0)
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

  it('keeps every persona fictional and phone numbers in the 555 range', () => {
    expect(personas.every((p) => p.email.endsWith('@convene.demo'))).toBe(true)
    expect(personas.every((p) => /^\+1(416|604)555\d{4}$/.test(p.phone))).toBe(true)
  })
})
