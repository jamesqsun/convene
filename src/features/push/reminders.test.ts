import { expect, it } from 'vitest'
import { bookGroup, createTestDb, createUser } from '../../../supabase/tests/harness'
import { enqueueFeedbackReminders } from './reminders'
import { drainNotificationJobs } from './sender'
import { fakePushSender } from './fake'

it('queues one reminder after completion, skips feedback and withdrawals, and suppresses answered jobs before delivery', async () => {
  const db = await createTestDb(),
    a = await createUser(db),
    b = await createUser(db),
    c = await createUser(db)
  const { eventId } = await bookGroup(db, {
    localDate: '2026-10-03',
    startIso: '2026-10-03T18:00:00Z',
    endIso: '2026-10-03T19:00:00Z',
    nowIso: '2026-10-01T00:00:00Z',
    users: [a, b, c],
  })
  const end = Date.parse('2026-10-03T19:00:00Z')
  expect(await enqueueFeedbackReminders(db, end - 1)).toBe(0)
  await db.query(
    'update event_participants set withdrawn_at = now() where event_id = $1 and user_id = $2',
    [eventId, c],
  )
  expect(await enqueueFeedbackReminders(db, end)).toBe(2)
  expect(await enqueueFeedbackReminders(db, end + 1000)).toBe(0)
  await db.query("insert into event_feedback (event_id, user_id, text) values ($1, $2, 'Great')", [
    eventId,
    a,
  ])
  await db.query("update notification_jobs set status = 'done' where type = 'assignment'")
  for (const user of [a, b])
    await db.query(
      "insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, 'k', 'a')",
      [user, `https://push/${user}`],
    )
  const push = fakePushSender()
  await drainNotificationJobs(db, push, end + 1000)
  expect(push.sent).toHaveLength(1)
  expect(JSON.stringify(push.sent)).toContain('How was your hangout?')
  expect(await enqueueFeedbackReminders(db, end + 100000000)).toBe(0)
})
