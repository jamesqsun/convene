import { beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '@/lib/db'
import { asRole, createTestDb, createUser } from '../tests/harness'

let db: Db

beforeAll(async () => {
  db = await createTestDb()
  await createUser(db)
})

describe('row level security', () => {
  it('is enabled on every public table', async () => {
    const rows = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'`,
    )
    expect(rows.length).toBeGreaterThan(10)
    expect(rows.filter((row) => !row.relrowsecurity).map((row) => row.relname)).toEqual([])
  })

  it.each(['anon', 'authenticated'] as const)('denies %s reads and writes', async (role) => {
    await expect(asRole(db, role, (tx) => tx.query('select id from profiles'))).rejects.toThrow(
      /permission denied/,
    )
    await expect(
      asRole(db, role, (tx) => tx.query('select 1 from availability_slots')),
    ).rejects.toThrow(/permission denied/)
    await expect(
      asRole(db, role, (tx) => tx.query('select 1 from participant_feedback')),
    ).rejects.toThrow(/permission denied/)
    await expect(
      asRole(db, role, (tx) =>
        tx.query(
          "insert into notification_jobs (event_id, recipient_id, type) values (gen_random_uuid(), gen_random_uuid(), 'assignment')",
        ),
      ),
    ).rejects.toThrow(/permission denied/)
  })

  it('denies the browser roles the transaction functions', async () => {
    await expect(
      asRole(db, 'authenticated', (tx) => tx.query("select commit_group_event('x')")),
    ).rejects.toThrow(/permission denied/)
    await expect(
      asRole(db, 'authenticated', (tx) =>
        tx.query('select withdraw_participant(gen_random_uuid(), gen_random_uuid())'),
      ),
    ).rejects.toThrow(/permission denied/)
    await expect(
      asRole(db, 'authenticated', (tx) =>
        tx.query(
          'select submit_feedback(gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), true)',
        ),
      ),
    ).rejects.toThrow(/permission denied/)
  })
})
