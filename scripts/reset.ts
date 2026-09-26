import { createClient } from '@supabase/supabase-js'
import { openPgDb } from '../src/lib/db-pg'
import { readEnv } from '../src/lib/env'
import { applyMigrations } from '../src/lib/migrate'
import { resetSeededWorld } from '../src/features/seed/reset'
import { loadDotEnvLocal } from './load-env'

async function main(): Promise<void> {
  if (!process.argv.includes('--yes'))
    throw new Error(
      'This deletes ALL Auth users and Convene data. Stop the app and scheduler, then run pnpm db:reset --yes to confirm.',
    )
  loadDotEnvLocal()
  const env = readEnv(process.env)
  if (env.mode !== 'supabase') throw new Error('db:reset requires CONVENE_MODE=supabase')
  console.log(`Resetting ${new URL(env.supabase.url).origin}`)
  const db = openPgDb(env.databaseUrl)
  const admin = createClient(env.supabase.url, env.supabase.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).auth.admin
  await applyMigrations(db)
  const summary = await resetSeededWorld(db, admin, env.seedPassword, Date.now())
  console.log(
    `Reset complete: ${summary.people} people, ${summary.slots} future slots, ${summary.historyEvents} past hangouts.`,
  )
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  console.error(
    'If reset started, it may be incomplete: Auth changes cannot be rolled back. Fix the error and rerun db:reset --yes.',
  )
  process.exit(1)
})
