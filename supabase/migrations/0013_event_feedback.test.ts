import { expect, it } from 'vitest'
import { createTestDb } from '../tests/harness'

it('enables deny-all RLS for private event feedback', async () => {
  const db = await createTestDb()
  const rows = await db.query<{ relrowsecurity: boolean }>(
    "select relrowsecurity from pg_class where relname = 'event_feedback'",
  )
  expect(rows[0]?.relrowsecurity).toBe(true)
  expect(await db.query("select * from pg_policies where tablename = 'event_feedback'")).toEqual([])
})
