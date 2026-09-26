import { beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '@/lib/db'
import { backdateEvent, bookGroup, count, createTestDb, createUser } from '../tests/harness'

let db: Db

beforeAll(async () => {
  db = await createTestDb()
})

const afterEnd = '2026-10-04T12:00:00Z'
let dateCounter = 3

async function completedEvent(n: number) {
  const users: string[] = []
  for (let i = 0; i < n; i += 1) users.push(await createUser(db))
  const localDate = `2026-10-${String(dateCounter++).padStart(2, '0')}`
  const { eventId } = await bookGroup(db, {
    localDate,
    startIso: `${localDate}T22:00:00Z`,
    endIso: `${localDate}T23:00:00Z`,
    nowIso: `${localDate.slice(0, 8)}01T00:00:00Z`,
    users,
  })
  await backdateEvent(db, eventId, '2026-10-03T23:00:00Z')
  return { users, eventId }
}

async function feedback(
  eventId: string,
  author: string,
  subject: string,
  meetAgain: boolean,
  nowIso = afterEnd,
): Promise<string> {
  const rows = await db.query<{ result: string }>(
    'select submit_feedback($1, $2, $3, $4, $5::timestamptz) as result',
    [eventId, author, subject, meetAgain, nowIso],
  )
  return rows[0]!.result
}

async function friendshipCount(a: string, b: string): Promise<number> {
  const [low, high] = [a, b].sort()
  return count(db, 'friendships', 'user_a = $1 and user_b = $2', [low, high])
}

describe('submit_feedback', () => {
  it('is locked until the event ends and after cancellation', async () => {
    const { users, eventId } = await completedEvent(2)
    await expect(
      feedback(eventId, users[0]!, users[1]!, true, '2026-10-03T22:30:00Z'),
    ).rejects.toThrow(/event_not_completed/)
    expect(await feedback(eventId, users[0]!, users[1]!, true, '2026-10-03T23:00:00Z')).toBe(
      'recorded',
    )
    await db.query("update events set status = 'cancelled' where id = $1", [eventId])
    await expect(feedback(eventId, users[1]!, users[0]!, true)).rejects.toThrow(/event_cancelled/)
  })

  it('rejects self, non-participants, and withdrawn people', async () => {
    const { users, eventId } = await completedEvent(3)
    await expect(feedback(eventId, users[0]!, users[0]!, true)).rejects.toThrow(/self_feedback/)
    const stranger = await createUser(db)
    await expect(feedback(eventId, stranger, users[0]!, true)).rejects.toThrow(/not_participant/)
    await expect(feedback(eventId, users[0]!, stranger, true)).rejects.toThrow(/not_participant/)
    await db.query(
      'update event_participants set withdrawn_at = now() where event_id = $1 and user_id = $2',
      [eventId, users[2]!],
    )
    await expect(feedback(eventId, users[2]!, users[0]!, true)).rejects.toThrow(/not_participant/)
    await expect(feedback(eventId, users[0]!, users[2]!, true)).rejects.toThrow(/not_participant/)
  })

  it('creates a friendship only on mutual explicit yes, exactly once', async () => {
    const { users, eventId } = await completedEvent(3)
    const [a, b, c] = users
    expect(await feedback(eventId, a!, b!, true)).toBe('recorded')
    expect(await friendshipCount(a!, b!)).toBe(0)

    expect(await feedback(eventId, b!, a!, true)).toBe('friendship_created')
    expect(await friendshipCount(a!, b!)).toBe(1)
    const provenance = await db.query<{ provenance_event_id: string }>(
      'select provenance_event_id from friendships',
    )
    expect(provenance[0]!.provenance_event_id).toBe(eventId)

    expect(await feedback(eventId, b!, a!, true)).toBe('unchanged')
    expect(await friendshipCount(a!, b!)).toBe(1)

    expect(await feedback(eventId, a!, c!, true)).toBe('recorded')
    expect(await feedback(eventId, c!, a!, false)).toBe('recorded')
    expect(await friendshipCount(a!, c!)).toBe(0)
  })

  it('treats answers as final', async () => {
    const { users, eventId } = await completedEvent(2)
    expect(await feedback(eventId, users[0]!, users[1]!, false)).toBe('recorded')
    await expect(feedback(eventId, users[0]!, users[1]!, true)).rejects.toThrow(/answer_final/)
    expect(await feedback(eventId, users[1]!, users[0]!, true)).toBe('recorded')
    await expect(feedback(eventId, users[1]!, users[0]!, false)).rejects.toThrow(/answer_final/)
    expect(await friendshipCount(users[0]!, users[1]!)).toBe(0)
  })
})
