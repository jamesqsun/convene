import type { Db } from '@/lib/db'
import type { SubscriptionInput } from './schemas'

/** Upserts by endpoint. A re-subscribe from another account moves the device to that account. */
export async function saveSubscription(
  db: Db,
  userId: string,
  input: SubscriptionInput,
  userAgent: string | null,
): Promise<string> {
  const rows = await db.query<{ id: string }>(
    `insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     values ($1, $2, $3, $4, $5)
     on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
       user_agent = excluded.user_agent, retired_at = null, failure_count = 0
     returning id`,
    [userId, input.endpoint, input.keys.p256dh, input.keys.auth, userAgent],
  )
  return rows[0]!.id
}

export async function removeSubscription(
  db: Db,
  userId: string,
  endpoint: string,
): Promise<boolean> {
  const rows = await db.query(
    'delete from push_subscriptions where user_id = $1 and endpoint = $2 returning id',
    [userId, endpoint],
  )
  return rows.length > 0
}

export async function hasActiveSubscription(
  db: Db,
  userId: string,
  endpoint: string,
): Promise<boolean> {
  const rows = await db.query(
    'select 1 from push_subscriptions where user_id = $1 and endpoint = $2 and retired_at is null',
    [userId, endpoint],
  )
  return rows.length > 0
}
