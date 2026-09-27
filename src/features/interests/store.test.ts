import { expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createTestDb, createUser, count } from '../../../supabase/tests/harness'
import { answerInterest, broadcastInterest, listInterestPrompts } from './store'

it('broadcasts once per subscribed user, hides other recipients, and makes answers idempotent', async () => {
  const db = await createTestDb(),
    a = await createUser(db),
    b = await createUser(db),
    retired = await createUser(db)
  for (const [user, endpoint] of [
    [a, 'a1'],
    [a, 'a2'],
    [b, 'b'],
    [retired, 'old'],
  ]) {
    await db.query(
      "insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, 'key', 'auth')",
      [user, `https://push/${endpoint}`],
    )
  }
  await db.query('update push_subscriptions set retired_at = now() where user_id = $1', [retired])
  const id = randomUUID(),
    now = Date.now()
  expect(await broadcastInterest(db, id, 'A football final this weekend', now)).toEqual({
    promptId: id,
    recipients: 2,
  })
  await broadcastInterest(db, id, 'A football final this weekend', now)
  expect(await count(db, 'notification_jobs')).toBe(2)
  expect(await listInterestPrompts(db, retired, now, id)).toEqual([])
  await expect(answerInterest(db, retired, id, 'yes', now)).rejects.toMatchObject({ status: 404 })
  expect((await answerInterest(db, a, id, 'no', now)).answer).toBe('no')
  expect((await listInterestPrompts(db, b, now, id))[0]!.answer).toBeNull()
  await answerInterest(db, a, id, 'no', now)
  await expect(answerInterest(db, a, id, 'yes', now)).rejects.toMatchObject({ status: 409 })
  await expect(broadcastInterest(db, id, 'Different message', now)).rejects.toMatchObject({
    status: 409,
  })
  expect(await count(db, 'preference_memories')).toBe(0)
})
