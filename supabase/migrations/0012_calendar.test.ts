import { beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '@/lib/db'
import { asRole, createTestDb, createUser } from '../tests/harness'

let db: Db

beforeAll(async () => {
  db = await createTestDb()
})

describe('calendar tables', () => {
  it('holds one connection per person with encrypted tokens and cascades on delete', async () => {
    const userId = await createUser(db)
    await db.query(
      "insert into calendar_connections (user_id, account_email, refresh_token_encrypted) values ($1, 'me@example.com', 'enc')",
      [userId],
    )
    await expect(
      db.query(
        "insert into calendar_connections (user_id, account_email, refresh_token_encrypted) values ($1, 'other', 'enc')",
        [userId],
      ),
    ).rejects.toThrow(/duplicate|unique/)
    await db.query(
      "insert into calendar_sources (user_id, calendar_id, summary, is_primary) values ($1, 'primary', 'Me', true)",
      [userId],
    )
    await db.query(
      "insert into busy_blocks (user_id, calendar_id, external_id, summary, starts_at, ends_at) values ($1, 'primary', 'e1', 'Dentist', '2026-10-03T14:00:00Z', '2026-10-03T15:00:00Z')",
      [userId],
    )
    await expect(
      db.query(
        "insert into busy_blocks (user_id, calendar_id, external_id, starts_at, ends_at) values ($1, 'primary', 'e2', '2026-10-03T15:00:00Z', '2026-10-03T15:00:00Z')",
        [userId],
      ),
    ).rejects.toThrow()
    await db.query('delete from auth.users where id = $1', [userId])
    expect(await db.query('select 1 from busy_blocks where user_id = $1', [userId])).toEqual([])
  })

  it('records one availability week per person and week start', async () => {
    const userId = await createUser(db)
    await db.query(
      "insert into availability_weeks (user_id, week_start, status) values ($1, '2026-09-28', 'auto')",
      [userId],
    )
    await expect(
      db.query(
        "insert into availability_weeks (user_id, week_start, status) values ($1, '2026-09-28', 'confirmed')",
        [userId],
      ),
    ).rejects.toThrow(/duplicate|unique/)
    await expect(
      db.query(
        "insert into availability_weeks (user_id, week_start, status) values ($1, '2026-10-05', 'draft')",
        [userId],
      ),
    ).rejects.toThrow(/status/)
    const profile = await db.query<{ is_repeating_availability: boolean }>(
      'select is_repeating_availability from profiles where id = $1',
      [userId],
    )
    expect(profile[0]!.is_repeating_availability).toBe(true)
  })

  it('denies the browser roles', async () => {
    for (const table of [
      'calendar_connections',
      'calendar_sources',
      'busy_blocks',
      'availability_weeks',
      'event_calendar_entries',
    ]) {
      await expect(
        asRole(db, 'authenticated', (tx) => tx.query(`select 1 from ${table}`)),
      ).rejects.toThrow(/permission denied/)
    }
  })
})
