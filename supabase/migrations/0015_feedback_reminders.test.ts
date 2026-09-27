import { expect, it } from 'vitest'
import { createTestDb } from '../tests/harness'

it('allows feedback reminders in the existing notification queue', async () => {
  const db = await createTestDb()
  const rows = await db.query<{ definition: string }>(
    "select pg_get_constraintdef(oid) as definition from pg_constraint where conname = 'notification_jobs_type_check'",
  )
  expect(rows[0]!.definition).toContain('feedback_reminder')
})
