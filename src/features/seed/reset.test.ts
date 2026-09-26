import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Db } from '@/lib/db'
import { fakeAiProvider } from '@/features/ai/fake'
import { createTestDb, createUser, count } from '../../../supabase/tests/harness'
import { personas } from './people'
import { resetSeededWorld, resetTables } from './reset'
import { seedDemoWorld } from './seed'

let db: Db
const now = Date.parse('2026-09-28T04:05:00Z')
beforeAll(async () => {
  db = await createTestDb()
})

function auth() {
  return {
    getUserById: vi.fn(async (id: string) => ({
      data: { user: (await db.query('select id from auth.users where id = $1', [id]))[0] },
      error: null,
    })),
    deleteUser: vi.fn(async (id: string) => {
      await db.query('delete from auth.users where id = $1', [id])
      return { data: { user: null }, error: null }
    }),
    createUser: vi.fn(async (attributes: { id?: string; email?: string }) => {
      await db.query('insert into auth.users (id, email) values ($1, $2)', [
        attributes.id,
        attributes.email,
      ])
      return { data: { user: { id: attributes.id } }, error: null }
    }),
  }
}
const adminType = (admin: ReturnType<typeof auth>) =>
  admin as unknown as Parameters<typeof resetSeededWorld>[1]

describe('resetSeededWorld', () => {
  it('removes extra users and dirty state, restores fresh seed counts, and can run twice', async () => {
    await seedDemoWorld(db, fakeAiProvider(), { now })
    const baseline = await Promise.all(resetTables.map((table) => count(db, table)))
    await seedDemoWorld(db, fakeAiProvider(), { now }) // Leaves cancelled slots in ordinary seed.
    const extra = await createUser(db)
    await db.query("update profiles set name = 'Changed' where id = $1", [personas[0]!.id])
    await db.query(
      "insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://example.test/push', 'key', 'secret')",
      [extra],
    )
    const admin = auth()
    for (let i = 0; i < 2; i++) {
      expect(await resetSeededWorld(db, adminType(admin), 'reset-password', now)).toEqual({
        people: 12,
        slots: 22,
        historyEvents: 2,
      })
      expect(await Promise.all(resetTables.map((table) => count(db, table)))).toEqual(baseline)
      expect(await count(db, 'auth.users')).toBe(12)
      expect(await db.query('select name from profiles where id = $1', [personas[0]!.id])).toEqual([
        { name: personas[0]!.name },
      ])
    }
    expect(admin.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ password: 'reset-password', email_confirm: true }),
    )
    expect(await count(db, 'schema_migrations')).toBe(12)
  })

  it('fails before deletion if API and database users do not match', async () => {
    const admin = auth()
    admin.getUserById.mockResolvedValueOnce({ data: { user: undefined }, error: null })
    await expect(resetSeededWorld(db, adminType(admin), 'password', now)).rejects.toThrow(
      'Auth preflight',
    )
    expect(admin.deleteUser).not.toHaveBeenCalled()
    expect(admin.createUser).not.toHaveBeenCalled()
    expect(await count(db, 'profiles')).toBe(12)
  })

  it('stops on an Auth deletion failure and can be retried', async () => {
    const admin = auth()
    admin.deleteUser.mockRejectedValueOnce(new Error('Auth unavailable'))
    await expect(resetSeededWorld(db, adminType(admin), 'password', now)).rejects.toThrow(
      'Auth unavailable',
    )
    expect(admin.createUser).not.toHaveBeenCalled()
    expect(await resetSeededWorld(db, adminType(admin), 'password', now)).toMatchObject({
      people: 12,
    })
  })

  it('recovers after only some seed accounts have been recreated', async () => {
    const admin = auth()
    const create = admin.createUser.getMockImplementation()!
    admin.createUser
      .mockImplementationOnce(create)
      .mockRejectedValueOnce(new Error('Network interrupted'))
    await expect(resetSeededWorld(db, adminType(admin), 'password', now)).rejects.toThrow(
      'Network interrupted',
    )
    expect(await count(db, 'auth.users')).toBe(1)
    expect(await resetSeededWorld(db, adminType(admin), 'password', now)).toEqual({
      people: 12,
      slots: 22,
      historyEvents: 2,
    })
  })
})
