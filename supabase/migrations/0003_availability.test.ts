import { beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '@/lib/db'
import { createSlot, createTestDb, createUser } from '../tests/harness'

let db: Db

beforeAll(async () => {
  db = await createTestDb()
})

const t10 = '2026-10-03T14:00:00Z'
const t11 = '2026-10-03T15:00:00Z'
const t12 = '2026-10-03T16:00:00Z'
const t1030 = '2026-10-03T14:30:00Z'

describe('availability_slots', () => {
  it('derives starts_at and ends_at from the range', async () => {
    const userId = await createUser(db)
    const slot = await createSlot(db, userId, t10, t11)
    const rows = await db.query<{ starts_at: Date; ends_at: Date; revision: number }>(
      'select starts_at, ends_at, revision from availability_slots where id = $1',
      [slot.id],
    )
    expect(rows[0]!.starts_at.toISOString()).toBe('2026-10-03T14:00:00.000Z')
    expect(rows[0]!.ends_at.toISOString()).toBe('2026-10-03T15:00:00.000Z')
    expect(rows[0]!.revision).toBe(1)
  })

  it('rejects empty ranges and closed upper bounds', async () => {
    const userId = await createUser(db)
    await expect(createSlot(db, userId, t10, t10)).rejects.toThrow()
    await expect(
      db.query(
        `insert into availability_slots (user_id, "window", timezone)
         values ($1, tstzrange($2::timestamptz, $3::timestamptz, '[]'), 'America/Toronto')`,
        [userId, t10, t11],
      ),
    ).rejects.toThrow()
  })

  it('cannot be filled without an assigned event', async () => {
    const userId = await createUser(db)
    const slot = await createSlot(db, userId, t10, t11)
    await expect(
      db.query("update availability_slots set status = 'filled' where id = $1", [slot.id]),
    ).rejects.toThrow()
  })

  it('forbids one person overlapping their own live slots but allows touching ones', async () => {
    const userId = await createUser(db)
    await createSlot(db, userId, t10, t11)
    await expect(createSlot(db, userId, t1030, t12)).rejects.toThrow(/exclusion/)
    await expect(createSlot(db, userId, t11, t12)).resolves.toBeDefined()
  })

  it('ignores cancelled and expired slots for overlap', async () => {
    const userId = await createUser(db)
    await createSlot(db, userId, t10, t11, 'cancelled')
    await createSlot(db, userId, t10, t11, 'expired')
    await expect(createSlot(db, userId, t1030, t12)).resolves.toBeDefined()
  })

  it('lets different people overlap', async () => {
    const a = await createUser(db)
    const b = await createUser(db)
    await createSlot(db, a, t10, t11)
    await expect(createSlot(db, b, t10, t11)).resolves.toBeDefined()
  })
})
