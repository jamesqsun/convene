import { beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '@/lib/db'
import { createTestDb, createUser } from '../tests/harness'

let db: Db

beforeAll(async () => {
  db = await createTestDb()
})

async function isStale(userId: string): Promise<boolean> {
  const rows = await db.query<{ embedding_stale: boolean }>(
    'select embedding_stale from profiles where id = $1',
    [userId],
  )
  return rows[0]!.embedding_stale
}

async function insertMemory(userId: string): Promise<string> {
  const rows = await db.query<{ id: string }>(
    `insert into preference_memories (user_id, topic, summary, confidence, source)
     values ($1, 'coffee', 'Likes quiet cafes.', 0.7, 'onboarding') returning id`,
    [userId],
  )
  return rows[0]!.id
}

describe('profiles', () => {
  it('accepts E.164 phones and rejects national formats', async () => {
    const userId = await createUser(db)
    await expect(
      db.query('update profiles set phone_e164 = $2 where id = $1', [userId, '+442071234567']),
    ).resolves.toBeDefined()
    await expect(
      db.query('update profiles set phone_e164 = $2 where id = $1', [userId, '4165550100']),
    ).rejects.toThrow(/phone_e164/)
    await expect(
      db.query('update profiles set phone_e164 = $2 where id = $1', [userId, '+0123']),
    ).rejects.toThrow(/phone_e164/)
  })

  it('requires adults', async () => {
    const userId = await createUser(db)
    await expect(db.query('update profiles set age = 17 where id = $1', [userId])).rejects.toThrow(
      /age/,
    )
    await expect(
      db.query('update profiles set age = 18 where id = $1', [userId]),
    ).resolves.toBeDefined()
  })

  it('keeps city key and time zone together', async () => {
    const userId = await createUser(db)
    await expect(
      db.query('update profiles set city_timezone = null where id = $1', [userId]),
    ).rejects.toThrow()
  })

  it('cannot be marked onboarded without the required fields', async () => {
    const userId = await createUser(db, { isOnboarded: false })
    await db.query('update profiles set phone_e164 = null where id = $1', [userId])
    await expect(
      db.query('update profiles set onboarding_completed_at = now() where id = $1', [userId]),
    ).rejects.toThrow()
  })

  it('bumps updated_at on change', async () => {
    const userId = await createUser(db)
    const before = await db.query<{ updated_at: Date }>(
      'select updated_at from profiles where id = $1',
      [userId],
    )
    await new Promise((resolve) => setTimeout(resolve, 5))
    await db.query("update profiles set name = 'Renamed' where id = $1", [userId])
    const after = await db.query<{ updated_at: Date }>(
      'select updated_at from profiles where id = $1',
      [userId],
    )
    expect(after[0]!.updated_at.getTime()).toBeGreaterThan(before[0]!.updated_at.getTime())
  })
})

describe('preference_memories', () => {
  it('validates attributes, confidence, and topic', async () => {
    const userId = await createUser(db)
    await expect(
      db.query(
        `insert into preference_memories (user_id, topic, summary, confidence, source, attributes)
         values ($1, 'x', 'y', 0.5, 'onboarding', '[]'::jsonb)`,
        [userId],
      ),
    ).rejects.toThrow(/attributes/)
    await expect(
      db.query(
        `insert into preference_memories (user_id, topic, summary, confidence, source) values ($1, 'x', 'y', 1.5, 'onboarding')`,
        [userId],
      ),
    ).rejects.toThrow(/confidence/)
    await expect(
      db.query(
        `insert into preference_memories (user_id, topic, summary, confidence, source) values ($1, '', 'y', 0.5, 'onboarding')`,
        [userId],
      ),
    ).rejects.toThrow(/topic/)
  })

  it('marks the profile embedding stale on meaningful changes only', async () => {
    const userId = await createUser(db)
    await db.query('update profiles set embedding_stale = false where id = $1', [userId])
    const memoryId = await insertMemory(userId)
    expect(await isStale(userId)).toBe(true)

    await db.query('update profiles set embedding_stale = false where id = $1', [userId])
    await db.query('update preference_memories set embedding_stale = false where id = $1', [
      memoryId,
    ])
    expect(await isStale(userId)).toBe(false)

    await db.query("update preference_memories set summary = 'Prefers tea.' where id = $1", [
      memoryId,
    ])
    expect(await isStale(userId)).toBe(true)

    await db.query('update profiles set embedding_stale = false where id = $1', [userId])
    await db.query('delete from preference_memories where id = $1', [memoryId])
    expect(await isStale(userId)).toBe(true)
  })

  it('is removed with its owner', async () => {
    const userId = await createUser(db)
    await insertMemory(userId)
    await db.query('delete from auth.users where id = $1', [userId])
    expect(
      await db.query('select 1 from preference_memories where user_id = $1', [userId]),
    ).toEqual([])
  })
})
