import type { Db } from '@/lib/db'

/** One reminder per active participant, within a day of completion (no historical notification flood). */
export async function enqueueFeedbackReminders(db: Db, now: number): Promise<number> {
  const rows = await db.query(
    `insert into notification_jobs (event_id, recipient_id, type, next_attempt_at)
     select e.id, ep.user_id, 'feedback_reminder', $1::timestamptz
     from events e join event_participants ep on ep.event_id = e.id and ep.withdrawn_at is null
     where e.status = 'scheduled' and e.ends_at <= $1::timestamptz
       and e.ends_at > $1::timestamptz - interval '24 hours'
       and not exists (select 1 from event_feedback f where f.event_id = e.id and f.user_id = ep.user_id)
     on conflict (event_id, recipient_id, type) do nothing returning id`,
    [new Date(now).toISOString()],
  )
  return rows.length
}
