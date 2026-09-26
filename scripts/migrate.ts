import { loadDotEnvLocal } from './load-env'
import { openPgDb } from '../src/lib/db-pg'
import { applyMigrations } from '../src/lib/migrate'

/** Applies supabase/migrations to the DATABASE_URL Postgres. Safe to re-run. */

async function main(): Promise<void> {
  loadDotEnvLocal()
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is required')
  const applied = await applyMigrations(openPgDb(url))
  console.log(
    applied.length === 0 ? 'Database already up to date.' : `Applied: ${applied.join(', ')}`,
  )
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
