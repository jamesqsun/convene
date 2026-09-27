import { expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createTestDb, createUser, asRole } from '../tests/harness'

it('protects prompts and responses with deny-all RLS and enforces notification targets', async () => {
  const db = await createTestDb(),
    user = await createUser(db),
    id = randomUUID()
  await db.query("insert into interest_prompts (id, text) values ($1, 'Topic')", [id])
  await db.query('insert into interest_responses (prompt_id, user_id) values ($1, $2)', [id, user])
  await db.exec('grant select on interest_prompts, interest_responses to anon, authenticated')
  for (const role of ['anon', 'authenticated'] as const) {
    expect(await asRole(db, role, (tx) => tx.query('select * from interest_prompts'))).toEqual([])
    expect(await asRole(db, role, (tx) => tx.query('select * from interest_responses'))).toEqual([])
  }
  await expect(
    db.query("insert into notification_jobs (recipient_id, type) values ($1, 'interest_prompt')", [
      user,
    ]),
  ).rejects.toThrow()
  await db.query(
    "insert into notification_jobs (prompt_id, recipient_id, type) values ($1, $2, 'interest_prompt')",
    [id, user],
  )
  await expect(
    db.query(
      "insert into notification_jobs (prompt_id, recipient_id, type) values ($1, $2, 'interest_prompt')",
      [id, user],
    ),
  ).rejects.toThrow()
})
