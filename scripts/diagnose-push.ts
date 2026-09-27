import { Pool } from 'pg'
import { loadDotEnvLocal } from './load-env'
async function main() {
  loadDotEnvLocal()
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing')
  const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 10000,
  })
  try {
    const subscriptions = await db.query(
      `select user_id, endpoint, retired_at, created_at from push_subscriptions order by created_at desc limit 20`,
    )
    console.log(
      'subscriptions',
      JSON.stringify(
        subscriptions.rows.map((r) => ({
          user: r.user_id.slice(-8),
          service: new URL(r.endpoint).hostname,
          active: r.retired_at === null,
          createdAt: r.created_at,
        })),
      ),
    )
    const jobs = await db.query(
      `select type, status, last_error, count(*)::int as count, max(created_at) as newest, max(finished_at) as latest_finished from notification_jobs group by type, status, last_error order by newest desc limit 20`,
    )
    console.log('jobs', JSON.stringify(jobs.rows))
    const deliveries = await db.query(
      `select status, last_status_code, count(*)::int as count, max(updated_at) as latest from notification_deliveries group by status, last_status_code`,
    )
    console.log('deliveries', JSON.stringify(deliveries.rows))
    const due = await db.query(
      `select count(*)::int as due from notification_jobs where status = 'pending' and next_attempt_at <= now()`,
    )
    console.log('due', JSON.stringify(due.rows))
  } finally {
    await db.end()
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Diagnostic failed')
  process.exitCode = 1
})
