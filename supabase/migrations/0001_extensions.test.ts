import { beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '@/lib/db'
import { localDayBounds } from '@/lib/time'
import { createTestDb } from '../tests/harness'

let db: Db

beforeAll(async () => {
  db = await createTestDb()
})

async function sqlBounds(date: string, timeZone: string): Promise<{ start: number; end: number }> {
  const rows = await db.query<{ start: Date; end: Date }>(
    'select lower(local_day_bounds($1::date, $2)) as start, upper(local_day_bounds($1::date, $2)) as end',
    [date, timeZone],
  )
  return { start: rows[0]!.start.getTime(), end: rows[0]!.end.getTime() }
}

describe('local_day_bounds', () => {
  it.each([
    ['America/New_York', '2026-03-08'],
    ['America/New_York', '2026-11-01'],
    ['America/New_York', '2026-06-15'],
    ['Europe/London', '2026-03-29'],
    ['Europe/London', '2026-10-25'],
    ['America/Santiago', '2026-09-06'],
    ['America/Havana', '2026-11-01'],
    ['Asia/Kolkata', '2026-01-01'],
    ['Pacific/Auckland', '2026-04-05'],
  ])('agrees with the TypeScript bounds for %s %s', async (timeZone, date) => {
    const expected = localDayBounds(timeZone, date)
    expect(await sqlBounds(date, timeZone)).toEqual({ start: expected.start, end: expected.end })
  })

  it('exposes the extensions the schema needs', async () => {
    const rows = await db.query<{ extname: string }>(
      'select extname from pg_extension order by extname',
    )
    const names = rows.map((row) => row.extname)
    expect(names).toContain('vector')
    expect(names).toContain('btree_gist')
  })
})
