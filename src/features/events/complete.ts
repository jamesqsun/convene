import type { Db } from '@/lib/db'

/** Manual completion uses the same timestamp-based semantics as natural completion. */
export async function completeAllEvents(db: Db, now: number): Promise<{ completed: number }> {
  return db.transaction(async (tx) => {
    const rows = await tx.query<{ id: string }>(
      `update events set
         starts_at = $1::timestamptz - (ends_at - starts_at),
         ends_at = $1::timestamptz
       where status = 'scheduled' and ends_at > $1::timestamptz
       returning id`,
      [new Date(now).toISOString()],
    )
    const ids = rows.map((row) => row.id)
    // Release obsolete future reservations, but retain filled slots and planning-date assignments.
    await tx.query('delete from participant_reservations where event_id = any($1::uuid[])', [ids])
    await tx.query(
      `update notification_jobs set status = 'done', finished_at = $2::timestamptz,
         last_error = 'event_manually_completed'
       where event_id = any($1::uuid[]) and status = 'pending'`,
      [ids, new Date(now).toISOString()],
    )
    return { completed: ids.length }
  })
}
