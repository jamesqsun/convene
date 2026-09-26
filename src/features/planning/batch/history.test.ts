import { beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '@/lib/db'
import {
  backdateEvent,
  bookGroup,
  createTestDb,
  createUser,
} from '../../../../supabase/tests/harness'
import { pairKey } from '../buckets/reconnection'
import { loadHistorySnapshot } from './history'

let db: Db
let dateCounter = 3

beforeAll(async () => {
  db = await createTestDb()
})

async function completedEvent(users: string[], endedAtIso: string): Promise<string> {
  const localDate = `2026-10-${String(dateCounter++).padStart(2, '0')}`
  const { eventId } = await bookGroup(db, {
    localDate,
    startIso: `${localDate}T22:00:00Z`,
    endIso: `${localDate}T23:00:00Z`,
    nowIso: `${localDate.slice(0, 8)}01T00:00:00Z`,
    users,
  })
  await backdateEvent(db, eventId, endedAtIso)
  return eventId
}

async function feedback(eventId: string, author: string, subject: string, yes: boolean) {
  await db.query('select submit_feedback($1, $2, $3, $4, $5::timestamptz)', [
    eventId,
    author,
    subject,
    yes,
    '2026-12-01T00:00:00Z',
  ])
}

const scoringTime = Date.parse('2026-12-01T00:00:00Z')

describe('loadHistorySnapshot', () => {
  it('records friendships and the latest completed shared event with mutual-yes status', async () => {
    const a = await createUser(db)
    const b = await createUser(db)
    const first = await completedEvent([a, b], '2026-09-01T23:00:00Z')
    await feedback(first, a, b, true)
    await feedback(first, b, a, true)
    let snapshot = await loadHistorySnapshot(db, [a, b], scoringTime)
    expect(snapshot.friendships[pairKey(a, b)]).toBeDefined()
    expect(snapshot.history[pairKey(a, b)]).toEqual({
      latestEventId: first,
      latestEventEnd: Date.parse('2026-09-01T23:00:00Z'),
      isMutualYesOnLatest: true,
    })

    const second = await completedEvent([a, b], '2026-10-15T23:00:00Z')
    snapshot = await loadHistorySnapshot(db, [a, b], scoringTime)
    expect(snapshot.history[pairKey(a, b)]).toMatchObject({
      latestEventId: second,
      isMutualYesOnLatest: false,
    })

    await feedback(second, a, b, true)
    await feedback(second, b, a, true)
    snapshot = await loadHistorySnapshot(db, [a, b], scoringTime)
    expect(snapshot.history[pairKey(a, b)]!.isMutualYesOnLatest).toBe(true)
  })

  it('ignores events after the scoring time, cancelled events, and withdrawn participants', async () => {
    const a = await createUser(db)
    const b = await createUser(db)
    const first = await completedEvent([a, b], '2026-09-01T23:00:00Z')
    await feedback(first, a, b, true)
    await feedback(first, b, a, true)
    const future = await completedEvent([a, b], '2026-12-15T23:00:00Z')
    const cancelled = await completedEvent([a, b], '2026-10-01T23:00:00Z')
    await db.query("update events set status = 'cancelled' where id = $1", [cancelled])
    const withdrawn = await completedEvent([a, b], '2026-10-20T23:00:00Z')
    await db.query(
      'update event_participants set withdrawn_at = now() where event_id = $1 and user_id = $2',
      [withdrawn, b],
    )
    const snapshot = await loadHistorySnapshot(db, [a, b], scoringTime)
    expect(snapshot.history[pairKey(a, b)]!.latestEventId).toBe(first)
    expect(future).not.toBe(first)
  })

  it('omits non-friends and returns nothing for fewer than two people', async () => {
    const a = await createUser(db)
    const b = await createUser(db)
    await completedEvent([a, b], '2026-09-01T23:00:00Z')
    const snapshot = await loadHistorySnapshot(db, [a, b], scoringTime)
    expect(snapshot.friendships).toEqual({})
    expect(snapshot.history).toEqual({})
    expect(await loadHistorySnapshot(db, [a], scoringTime)).toEqual({
      scoringTime,
      friendships: {},
      history: {},
    })
  })
})
