import { beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '@/lib/db'
import { bookGroup, createTestDb, createUser } from '../../../supabase/tests/harness'
import { withdrawFromEvent } from './withdraw'

let db: Db

beforeAll(async () => {
  db = await createTestDb()
})

describe('withdrawFromEvent', () => {
  it('maps outcomes and errors', async () => {
    const users = [await createUser(db), await createUser(db), await createUser(db)]
    const { eventId } = await bookGroup(db, {
      localDate: '2026-10-03',
      startIso: '2026-10-03T22:00:00Z',
      endIso: '2026-10-03T23:00:00Z',
      nowIso: '2026-10-01T00:00:00Z',
      users,
    })
    const before = Date.parse('2026-10-02T00:00:00Z')
    expect(await withdrawFromEvent(db, users[0]!, eventId, before)).toEqual({
      result: 'withdrawn',
      remaining: 2,
    })
    expect(await withdrawFromEvent(db, users[0]!, eventId, before)).toEqual({
      result: 'already_withdrawn',
      remaining: 2,
    })
    await expect(
      withdrawFromEvent(db, users[1]!, eventId, Date.parse('2026-10-03T22:00:00Z')),
    ).rejects.toMatchObject({ status: 409, code: 'event_started' })
    await expect(
      withdrawFromEvent(db, await createUser(db), eventId, before),
    ).rejects.toMatchObject({ status: 404 })
    await expect(
      withdrawFromEvent(db, users[1]!, '00000000-0000-0000-0000-000000000000', before),
    ).rejects.toMatchObject({ status: 404 })
    expect(await withdrawFromEvent(db, users[1]!, eventId, before)).toEqual({
      result: 'event_cancelled',
      remaining: 1,
    })
  })
})
