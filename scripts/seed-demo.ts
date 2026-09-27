import { type CityMatch, resolveCity } from '../src/features/cities/search'
import {
  demoBlocks,
  demoCity,
  demoPastEvents,
  demoPeople,
  demoShowcase,
} from '../src/features/seed/demo'
import type { Persona } from '../src/features/seed/people'
import { wipeWorld } from '../src/features/seed/reset'
import { seedDemoWorld } from '../src/features/seed/seed'
import type { Db } from '../src/lib/db'
import { openPgDb } from '../src/lib/db-pg'
import { type ConnectedEnv, readEnv } from '../src/lib/env'
import { applyMigrations, pendingMigrations } from '../src/lib/migrate'
import { providersFor } from '../src/lib/providers'
import { addLocalDays, localDateOf } from '../src/lib/time'
import { loadDotEnvLocal } from './load-env'

/**
 * `pnpm seed:demo --yes` applies pending migrations, wipes the database, and seeds the demo cast:
 * the same twenty-five people and history every time, with dates relative to today. Without
 * `--yes` it only reports what it would apply and delete.
 */

/** Uses the Auth admin endpoint directly: the Supabase client needs a WebSocket Node 20 lacks. */
async function createAccount(env: ConnectedEnv, persona: Persona): Promise<void> {
  const key = env.supabase.serviceRoleKey
  const response = await fetch(new URL('/auth/v1/admin/users', env.supabase.url), {
    method: 'POST',
    headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      id: persona.id,
      email: persona.email,
      password: env.seedPassword,
      email_confirm: true,
    }),
  })
  if (!response.ok)
    throw new Error(
      `Could not create ${persona.email}: HTTP ${response.status} ${await response.text()}`,
    )
}

async function contents(db: Db): Promise<string> {
  const schema = await db.query<{ is_present: boolean }>(
    "select to_regclass('public.events') is not null as is_present",
  )
  if (!schema[0]?.is_present) return 'no Convene tables yet'
  const rows = await db.query<{ accounts: number; outside: number; hangouts: number }>(
    `select (select count(*)::int from auth.users) as accounts,
            (select count(*)::int from auth.users where email not like '%@convene.demo') as outside,
            (select count(*)::int from events) as hangouts`,
  )
  const { accounts, outside, hangouts } = rows[0]!
  return `${accounts} accounts (${outside} of them not seeded ones) and ${hangouts} hangouts`
}

const dayLabel = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})

/** One line per day the cast is free, with the hours a newcomer can pick from. */
function openDays(timezone: string, now: number): string[] {
  const today = localDateOf(timezone, now)
  const offsets = [...new Set(demoBlocks.map((block) => block.dayOffset))].sort((a, b) => a - b)
  return offsets.map((offset) => {
    const blocks = demoBlocks.filter((block) => block.dayOffset === offset)
    const start = blocks.map((block) => block.start).sort()[0]
    const end = blocks
      .map((block) => block.end)
      .sort()
      .at(-1)
    const date = new Date(`${addLocalDays(today, offset)}T12:00:00Z`)
    return `${dayLabel.format(date)}, ${start} to ${end}`
  })
}

function printDemoSteps(cityName: string, days: readonly string[], showcase: Persona): void {
  console.log(`
Demo
  1. Sign up as yourself and choose ${cityName} in onboarding.
  2. Add two or more hours of availability on any of:
${days.map((day) => `       ${day}`).join('\n')}
  3. Allow notifications when the app asks, so the next steps reach your device.
  4. pnpm planning:run-all       you are matched into a group of four or five
  5. pnpm events:complete-all    the hangout is over; answer the feedback
  6. pnpm interests:send "..."   a check-in arrives; answer yes or no
  7. pnpm interests:discover     a check-in about a real upcoming ${cityName} event
  8. For a full friend graph, sign in as ${showcase.email} (${showcase.name})
     with the SEED_PASSWORD from .env.local.`)
}

async function seedCast(env: ConnectedEnv, db: Db, city: CityMatch): Promise<void> {
  const now = Date.now()
  const people = demoPeople()
  const summary = await seedDemoWorld(db, providersFor(env).ai, {
    now,
    people,
    pastEvents: demoPastEvents(people),
    ensureAuthUser: (persona) => createAccount(env, persona),
  })
  console.log(
    `Seeded ${summary.people} people in ${city.name}, ${summary.slots} slots, ${summary.historyEvents} past hangouts.`,
  )
  printDemoSteps(city.name, openDays(city.timezone, now), demoShowcase(people))
}

async function reportOnly(db: Db, origin: string): Promise<void> {
  const pending = await pendingMigrations(db)
  if (pending.length > 0) console.log(`This would first apply: ${pending.join(', ')}.`)
  console.log(`This would delete everything in ${origin}, which holds ${await contents(db)}.`)
  console.log('Nothing was changed. Run pnpm seed:demo --yes to go ahead.')
}

async function main(): Promise<void> {
  loadDotEnvLocal()
  const env = readEnv(process.env)
  if (env.mode !== 'supabase') throw new Error('pnpm seed:demo requires CONVENE_MODE=supabase')
  const city = resolveCity(demoCity.key)
  if (!city) throw new Error(`Demo city ${demoCity.key} is unknown`)
  const db = openPgDb(env.databaseUrl)
  const origin = new URL(env.supabase.url).origin
  if (!process.argv.includes('--yes')) {
    await reportOnly(db, origin)
    process.exit(1)
  }
  const applied = await applyMigrations(db)
  if (applied.length > 0) console.log(`Applied ${applied.join(', ')}.`)
  console.log(`Wiping ${origin}, which holds ${await contents(db)}.`)
  await wipeWorld(db)
  await seedCast(env, db, city)
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  console.error('If the wipe had started, rerun pnpm seed:demo --yes; it starts from empty again.')
  process.exit(1)
})
