import { expect, it } from 'vitest'
import { createTestDb } from '../tests/harness'

it('adds durable retry fields and a pending-work index', async () => {
  const db = await createTestDb()
  const columns = await db.query<{ column_name: string }>(
    "select column_name from information_schema.columns where table_name = 'event_feedback'",
  )
  expect(columns.map((column) => column.column_name)).toEqual(
    expect.arrayContaining([
      'memory_attempts',
      'memory_next_attempt_at',
      'memory_lease_until',
      'memory_claim_id',
    ]),
  )
  expect(
    await db.query(
      "select indexname from pg_indexes where indexname = 'event_feedback_pending_idx'",
    ),
  ).toHaveLength(1)
})
