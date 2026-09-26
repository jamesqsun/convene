import { createClient } from '@supabase/supabase-js'
import { openPgDb } from '../src/lib/db-pg'
import { readEnv } from '../src/lib/env'
import { providersFor } from '../src/lib/providers'
import type { Persona } from '../src/features/seed/people'
import { seedDemoWorld } from '../src/features/seed/seed'
import { loadDotEnvLocal } from './load-env'

/**
 * Seeds the fictional pool into Supabase. Personas get real auth accounts (password SEED_PASSWORD)
 * so they can be signed in as; their profile ids are the ids Supabase assigns.
 */
async function main(): Promise<void> {
  loadDotEnvLocal()
  const env = readEnv(process.env)
  if (env.mode !== 'supabase')
    throw new Error('pnpm seed is for CONVENE_MODE=supabase; demo mode seeds itself on start')
  const admin = createClient(env.supabase.url, env.supabase.serviceRoleKey, {
    auth: { persistSession: false },
  })
  const db = openPgDb(env.databaseUrl)

  const ensureAuthUser = async (persona: Persona) => {
    const existing = await db.query('select 1 from auth.users where id = $1', [persona.id])
    if (existing.length > 0) return
    const { error } = await admin.auth.admin.createUser({
      id: persona.id,
      email: persona.email,
      password: env.seedPassword,
      email_confirm: true,
    } as never)
    if (error) throw new Error(`Could not create ${persona.email}: ${error.message}`)
  }

  const summary = await seedDemoWorld(db, providersFor(env).ai, { now: Date.now(), ensureAuthUser })
  console.log(
    `Seeded ${summary.people} people, ${summary.slots} slots, ${summary.historyEvents} past hangouts.`,
  )
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
