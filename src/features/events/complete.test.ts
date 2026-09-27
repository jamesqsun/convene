import { expect, it } from 'vitest'
import {
  backdateEvent,
  bookGroup,
  count,
  createTestDb,
  createUser,
} from '../../../supabase/tests/harness'
import { completeAllEvents } from './complete'
import { loadHangouts, loadPlans } from './read'
import { fakePushSender } from '@/features/push/fake'
import { drainNotificationJobs } from '@/features/push/sender'

it('completes future and ongoing events, unlocks feedback, and is idempotent', async () => {
  const db = await createTestDb()
  const a = await createUser(db)
  const b = await createUser(db)
  const book = async (day: string) =>
    (
      await bookGroup(db, {
        localDate: `2026-10-${day}`,
        startIso: `2026-10-${day}T18:00:00Z`,
        endIso: `2026-10-${day}T19:00:00Z`,
        nowIso: '2026-09-28T00:00:00Z',
        users: [a, b],
      })
    ).eventId
  const ongoing = await book('01')
  const future = await book('03')
  const past = await book('04')
  const cancelled = await book('05')
  await backdateEvent(db, past, '2026-09-30T19:00:00Z')
  await db.query("update events set status = 'cancelled' where id = $1", [cancelled])
  const untouched = await db.query('select * from events where id = any($1::uuid[]) order by id', [
    [past, cancelled],
  ])
  const now = Date.parse('2026-10-01T18:30:00Z')
  expect(await completeAllEvents(db, now)).toEqual({ completed: 2 })
  const changed = await db.query<{ starts_at: Date; ends_at: Date }>(
    'select starts_at, ends_at from events where id = any($1::uuid[])',
    [[ongoing, future]],
  )
  for (const event of changed) {
    expect(event.ends_at.getTime()).toBe(now)
    expect(event.ends_at.getTime() - event.starts_at.getTime()).toBe(60 * 60 * 1000)
  }
  expect(
    await db.query('select * from events where id = any($1::uuid[]) order by id', [
      [past, cancelled],
    ]),
  ).toEqual(untouched)
  expect((await loadPlans(db, a, now)).some((plan) => plan.eventId === future)).toBe(false)
  expect(await loadHangouts(db, a, now)).toHaveLength(3)
  await db.query('select submit_feedback($1, $2, $3, true, $4::timestamptz)', [
    future,
    a,
    b,
    new Date(now).toISOString(),
  ])
  expect(await count(db, 'participant_feedback')).toBe(1)
  expect(await count(db, 'participant_reservations', 'event_id = $1', [future])).toBe(0)
  expect(await count(db, 'user_date_assignments', 'event_id = $1', [future])).toBe(2)
  expect(
    await count(
      db,
      'notification_jobs',
      "event_id = $1 and status = 'pending' and type = 'feedback_reminder'",
      [future],
    ),
  ).toBe(2)
  await db.query(
    "insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://push/completion', 'k', 'a')",
    [a],
  )
  expect(await completeAllEvents(db, now + 1000)).toEqual({ completed: 0 })
  const push = fakePushSender()
  await drainNotificationJobs(db, push, now + 1000)
  const reminders = push.sent
    .map((entry) => JSON.parse(entry.payload))
    .filter((entry) => entry.tag === `feedback_reminder:${future}`)
  expect(reminders).toHaveLength(1)
  expect(reminders[0]).toMatchObject({ title: 'How was your hangout?', url: `/plans/${future}` })
  await completeAllEvents(db, now + 2000)
  await drainNotificationJobs(db, push, now + 2000)
  expect(
    push.sent
      .map((entry) => JSON.parse(entry.payload))
      .filter((entry) => entry.tag === `feedback_reminder:${future}`),
  ).toHaveLength(1)
})
