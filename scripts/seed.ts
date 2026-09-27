import { createClient } from '@supabase/supabase-js'
import type { AiProvider } from '../src/features/ai/provider'
import type { Db } from '../src/lib/db'
import { openPgDb } from '../src/lib/db-pg'
import { readEnv } from '../src/lib/env'
import { providersFor } from '../src/lib/providers'
import { generatedPastEvents, generatedPeople } from '../src/features/seed/generate'
import type { Persona } from '../src/features/seed/people'
import { type SeedOptions, seedDemoWorld } from '../src/features/seed/seed'
import { loadDotEnvLocal } from './load-env'

/**
 * Seeds the fictional pool into Supabase. Personas get real auth accounts (password SEED_PASSWORD)
 * so they can be signed in as; their profile ids are the ids Supabase assigns.
 *
 * `pnpm seed --people 200` also adds that many generated people, with memories and availability,
 * and past hangouts among them. Generated ids are fixed, so a rerun updates the same people.
 */

const maxGeneratedPeople = 1000
const peoplePerPastEvent = 3
const progressEvery = 25

function generatedPeopleCount(args: readonly string[]): number {
  const flag = args.indexOf('--people')
  if (flag === -1) return 0
  const count = Number(args[flag + 1])
  if (!Number.isInteger(count) || count < 1 || count > maxGeneratedPeople)
    throw new Error(`--people needs a whole number from 1 to ${maxGeneratedPeople}`)
  return count
}

async function seedGeneratedPeople(
  db: Db,
  ai: AiProvider,
  ensureAuthUser: NonNullable<SeedOptions['ensureAuthUser']>,
  count: number,
): Promise<void> {
  const people = generatedPeople(count)
  const pastEvents = generatedPastEvents(people, Math.floor(count / peoplePerPastEvent))
  let started = 0
  const summary = await seedDemoWorld(db, ai, {
    now: Date.now(),
    people,
    pastEvents,
    ensureAuthUser: async (persona) => {
      if (started % progressEvery === 0) console.log(`  person ${started + 1} of ${count}`)
      started += 1
      await ensureAuthUser(persona)
    },
  })
  console.log(
    `Generated ${summary.people} people, ${summary.slots} slots, ${summary.historyEvents} past hangouts.`,
  )
}

async function main(): Promise<void> {
  const generatedCount = generatedPeopleCount(process.argv.slice(2))
  loadDotEnvLocal()
  const env = readEnv(process.env)
  if (env.mode !== 'supabase')
    throw new Error('pnpm seed is for CONVENE_MODE=supabase; demo mode seeds itself on start')
  const admin = createClient(env.supabase.url, env.supabase.serviceRoleKey, {
    auth: { persistSession: false },
  })
  const db = openPgDb(env.databaseUrl)
  const ai = providersFor(env).ai

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

  const summary = await seedDemoWorld(db, ai, { now: Date.now(), ensureAuthUser })
  console.log(
    `Seeded ${summary.people} people, ${summary.slots} slots, ${summary.historyEvents} past hangouts.`,
  )
  if (generatedCount > 0) await seedGeneratedPeople(db, ai, ensureAuthUser, generatedCount)
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
