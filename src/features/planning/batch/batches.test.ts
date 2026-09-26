import { beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '@/lib/db'
import { hour, localDayBounds, zonedTime } from '@/lib/time'
import {
  bookGroup,
  createSlot,
  createTestDb,
  createUser,
  toronto,
} from '../../../../supabase/tests/harness'
import {
  claimBatch,
  expireDeadSlots,
  finishBatch,
  listBatchStates,
  listCityClocks,
  loadExcludedUsers,
  loadPendingSlots,
  loadProfiles,
  markProposalFailed,
  upsertProposals,
} from './batches'

let db: Db
const now = zonedTime(toronto.timezone, '2026-09-28') + 5 * 60_000
const due = {
  cityKey: toronto.cityKey,
  timezone: toronto.timezone,
  localDate: '2026-09-30',
  kind: 'main' as const,
}

beforeAll(async () => {
  db = await createTestDb()
})

describe('claimBatch', () => {
  it('creates a running pass, refuses a live lease, and retries a crashed pass in place', async () => {
    const first = await claimBatch(db, due, now, 'worker-a')
    expect(first).toMatchObject({
      cityKey: toronto.cityKey,
      localDate: '2026-09-30',
      pass: 1,
      attempts: 1,
      scoringTime: now,
      snapshot: null,
    })
    expect(await claimBatch(db, due, now + 60_000, 'worker-b')).toBeNull()

    const afterLease = now + 11 * 60_000
    const retry = await claimBatch(db, due, afterLease, 'worker-b')
    expect(retry).toMatchObject({ id: first!.id, pass: 1, attempts: 2, scoringTime: now })
  })

  it('starts a new pass after a finished one and keeps counting attempts after failures', async () => {
    const batch = (await claimBatch(db, { ...due, localDate: '2026-10-01' }, now, 'w'))!
    await finishBatch(db, batch.id, 'done', now + 1000, null)
    const states = await listBatchStates(db, ['2026-10-01'])
    expect(states[0]).toMatchObject({ status: 'done', attempts: 1, finishedAt: now + 1000 })

    const second = (await claimBatch(
      db,
      { ...due, localDate: '2026-10-01', kind: 'catchup' },
      now + hour,
      'w',
    ))!
    expect(second).toMatchObject({ pass: 2, attempts: 1, scoringTime: now + hour, snapshot: null })
    await finishBatch(db, second.id, 'failed', now + hour, 'boom')
    const third = (await claimBatch(db, { ...due, localDate: '2026-10-01' }, now + 2 * hour, 'w'))!
    expect(third).toMatchObject({ pass: 3, attempts: 2 })
  })
})

describe('slot and profile loading', () => {
  it('lists cities for onboarded people only', async () => {
    await createUser(db, {
      cityKey: 'ca:british columbia:vancouver',
      timezone: 'America/Vancouver',
    })
    await createUser(db, {
      cityKey: 'us:new york:new york',
      timezone: 'America/New_York',
      isOnboarded: false,
    })
    const cities = await listCityClocks(db)
    expect(cities.map((c) => c.cityKey)).toContain('ca:british columbia:vancouver')
    expect(cities.map((c) => c.cityKey)).not.toContain('us:new york:new york')
  })

  it('loads pending slots intersecting the day for the city', async () => {
    const day = localDayBounds(toronto.timezone, '2026-11-10')
    const local = await createUser(db)
    const elsewhere = await createUser(db, {
      cityKey: 'ca:british columbia:vancouver',
      timezone: 'America/Vancouver',
    })
    const inside = await createSlot(
      db,
      local,
      new Date(day.start + 18 * hour).toISOString(),
      new Date(day.start + 20 * hour).toISOString(),
    )
    await createSlot(
      db,
      local,
      new Date(day.end + hour).toISOString(),
      new Date(day.end + 3 * hour).toISOString(),
    )
    await createSlot(
      db,
      local,
      new Date(day.start + 10 * hour).toISOString(),
      new Date(day.start + 12 * hour).toISOString(),
      'paused',
    )
    await createSlot(
      db,
      elsewhere,
      new Date(day.start + 18 * hour).toISOString(),
      new Date(day.start + 20 * hour).toISOString(),
    )
    const slots = await loadPendingSlots(db, toronto.cityKey, day)
    expect(slots.map((s) => s.id)).toEqual([inside.id])
    expect(slots[0]).toMatchObject({ userId: local, revision: 1, startsAt: day.start + 18 * hour })
  })

  it('excludes people assigned on the date and people with two failed groups', async () => {
    const assigned = await createUser(db)
    const partner = await createUser(db)
    await bookGroup(db, {
      localDate: '2026-11-12',
      startIso: '2026-11-13T00:00:00Z',
      endIso: '2026-11-13T01:00:00Z',
      nowIso: '2026-11-10T00:00:00Z',
      users: [assigned, partner],
    })
    const batch = (await claimBatch(db, { ...due, localDate: '2026-11-12' }, now, 'w'))!
    const unlucky = await createUser(db)
    const slot = await createSlot(db, unlucky, '2026-11-13T00:00:00Z', '2026-11-13T02:00:00Z')
    const member = [
      { userId: unlucky, slotId: slot.id, revision: slot.revision, segmentStart: 0, segmentEnd: 1 },
    ]
    for (const planningId of ['fail-1', 'fail-2']) {
      await upsertProposals(db, batch, [
        {
          planningId,
          members: member,
          sharedStart: Date.parse('2026-11-13T00:00:00Z'),
          sharedEnd: Date.parse('2026-11-13T02:00:00Z'),
        },
      ])
      await markProposalFailed(db, planningId, 'no_venue')
    }
    const excluded = await loadExcludedUsers(db, batch)
    expect(excluded.has(assigned)).toBe(true)
    expect(excluded.has(partner)).toBe(true)
    expect(excluded.has(unlucky)).toBe(true)
  })

  it('loads the most confident memories and ignores stale embeddings', async () => {
    const fresh = await createUser(db, { interests: ['coffee', 'art'] })
    const stale = await createUser(db)
    const vector = `[${new Array(1536)
      .fill(0)
      .map((_, i) => (i === 0 ? 1 : 0))
      .join(',')}]`
    for (let i = 0; i < 7; i += 1) {
      await db.query(
        "insert into preference_memories (user_id, topic, summary, confidence, source) values ($1, $2, 'summary', $3, 'seed')",
        [fresh, `topic-${i}`, i / 10],
      )
    }
    await db.query(
      'update profiles set profile_embedding = $2::vector, embedding_stale = false where id = $1',
      [fresh, vector],
    )
    await db.query(
      'update profiles set profile_embedding = $2::vector, embedding_stale = true where id = $1',
      [stale, vector],
    )
    const profiles = await loadProfiles(db, [fresh, stale])
    expect(profiles.get(fresh)!.embedding![0]).toBe(1)
    expect(profiles.get(fresh)!.interests).toEqual(['coffee', 'art'])
    expect(profiles.get(fresh)!.memories.map((m) => m.topic)).toEqual([
      'topic-6',
      'topic-5',
      'topic-4',
      'topic-3',
      'topic-2',
    ])
    expect(profiles.get(stale)!.embedding).toBeNull()
    expect(await loadProfiles(db, [])).toEqual(new Map())
  })

  it('upserts proposals and reports existing statuses', async () => {
    const batch = (await claimBatch(db, { ...due, localDate: '2026-11-20' }, now, 'w'))!
    const user = await createUser(db)
    const slot = await createSlot(db, user, '2026-11-21T00:00:00Z', '2026-11-21T02:00:00Z')
    const draft = {
      planningId: 'p-1',
      members: [{ userId: user, slotId: slot.id, revision: 1, segmentStart: 0, segmentEnd: 1 }],
      sharedStart: Date.parse('2026-11-21T00:00:00Z'),
      sharedEnd: Date.parse('2026-11-21T02:00:00Z'),
    }
    expect(await upsertProposals(db, batch, [draft])).toEqual(new Map([['p-1', 'proposed']]))
    await markProposalFailed(db, 'p-1', 'x')
    expect(await upsertProposals(db, batch, [draft])).toEqual(new Map([['p-1', 'failed']]))
  })

  it('expires slots that can no longer hold a window 48 hours out', async () => {
    const user = await createUser(db)
    const soon = await createSlot(
      db,
      user,
      new Date(now + 47 * hour).toISOString(),
      new Date(now + 48 * hour + 30 * 60_000).toISOString(),
    )
    const fine = await createSlot(
      db,
      user,
      new Date(now + 50 * hour).toISOString(),
      new Date(now + 52 * hour).toISOString(),
    )
    expect(await expireDeadSlots(db, now)).toBeGreaterThanOrEqual(1)
    const statuses = await db.query<{ id: string; status: string }>(
      'select id, status from availability_slots where id = any($1::uuid[])',
      [[soon.id, fine.id]],
    )
    expect(statuses.find((s) => s.id === soon.id)?.status).toBe('expired')
    expect(statuses.find((s) => s.id === fine.id)?.status).toBe('pending')
  })
})
