import { beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '@/lib/db'
import { backdateEvent, bookGroup, createTestDb, createUser } from '../../../supabase/tests/harness'
import { loadGraph } from './read'

let db: Db

beforeAll(async () => {
  db = await createTestDb()
})

describe('loadGraph', () => {
  it('lists completed co-participants who are mutual friends, excluding non-friends, cancelled and withdrawn', async () => {
    const me = await createUser(db, { name: 'Me' })
    const friend = await createUser(db, { name: 'Friend' })
    const acquaintance = await createUser(db, { name: 'Acq' })
    const leaver = await createUser(db, { name: 'Leaver' })
    const first = (
      await bookGroup(db, {
        localDate: '2026-10-03',
        startIso: '2026-10-03T22:00:00Z',
        endIso: '2026-10-03T23:00:00Z',
        nowIso: '2026-10-01T00:00:00Z',
        users: [me, friend, leaver],
      })
    ).eventId
    await db.query('select withdraw_participant($1, $2, $3::timestamptz)', [
      first,
      leaver,
      '2026-10-02T00:00:00Z',
    ])
    await backdateEvent(db, first, '2026-09-01T23:00:00Z')
    await db.query('select submit_feedback($1, $2, $3, true, $4::timestamptz)', [
      first,
      me,
      friend,
      '2026-09-02T00:00:00Z',
    ])
    await db.query('select submit_feedback($1, $2, $3, true, $4::timestamptz)', [
      first,
      friend,
      me,
      '2026-09-02T00:00:00Z',
    ])
    const second = (
      await bookGroup(db, {
        localDate: '2026-10-05',
        startIso: '2026-10-05T22:00:00Z',
        endIso: '2026-10-05T23:00:00Z',
        nowIso: '2026-10-01T00:00:00Z',
        users: [me, friend, acquaintance],
      })
    ).eventId
    await backdateEvent(db, second, '2026-09-20T23:00:00Z')
    const cancelled = (
      await bookGroup(db, {
        localDate: '2026-10-07',
        startIso: '2026-10-07T22:00:00Z',
        endIso: '2026-10-07T23:00:00Z',
        nowIso: '2026-10-01T00:00:00Z',
        users: [me, acquaintance],
      })
    ).eventId
    await db.query("update events set status = 'cancelled' where id = $1", [cancelled])

    const graph = await loadGraph(db, me, Date.parse('2026-10-01T00:00:00Z'))
    expect(graph).toEqual([
      {
        userId: friend,
        name: 'Friend',
        interests: ['coffee'],
        meetings: 2,
        lastMetAt: Date.parse('2026-09-20T23:00:00Z'),
      },
    ])
    expect(JSON.stringify(graph)).not.toContain('+1416')
    expect(await loadGraph(db, leaver, Date.parse('2026-10-01T00:00:00Z'))).toEqual([])
  })
})
