import { resolveCity } from '@/features/cities/search'
import { refreshDerived } from '@/features/memories/derived'
import { memoryText, replaceMemories } from '@/features/memories/store'
import type { AiProvider } from '@/features/ai/provider'
import { attributesToObject } from '@/features/ai/schemas'
import type { Db } from '@/lib/db'
import { addLocalDays, localDateOf, zonedTime } from '@/lib/time'
import { seedHistory } from './history'
import { type Persona, personas } from './people'

/**
 * Populates the fictional world. Runs on every demo boot (fresh database) and via `pnpm seed`
 * against Supabase (idempotent upserts by fixed id). Availability is regenerated each run for the
 * next two planning dates so the first batch always has something to work with.
 */

export interface SeedOptions {
  now: number
  /** Connected mode creates auth users through Supabase; demo mode inserts the shim row directly. */
  ensureAuthUser?: (persona: Persona) => Promise<void>
}

export interface SeedSummary {
  people: number
  slots: number
  historyEvents: number
}

async function ensureDemoAuthUser(db: Db, persona: Persona): Promise<void> {
  await db.query('insert into auth.users (id, email) values ($1, $2) on conflict (id) do nothing', [
    persona.id,
    persona.email,
  ])
}

async function upsertProfile(db: Db, persona: Persona): Promise<void> {
  const city = resolveCity(persona.cityKey)
  if (!city) throw new Error(`Seed city ${persona.cityKey} is unknown`)
  await db.query(
    `insert into profiles (id, name, age, city_key, city_name, city_timezone, city_lat, city_lng, phone_e164, interests, onboarding_answers, onboarding_completed_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, case when $12 then now() else null end)
     on conflict (id) do update set
       name = excluded.name, age = excluded.age, city_key = excluded.city_key, city_name = excluded.city_name,
       city_timezone = excluded.city_timezone, city_lat = excluded.city_lat, city_lng = excluded.city_lng,
       phone_e164 = excluded.phone_e164, interests = excluded.interests, onboarding_answers = excluded.onboarding_answers,
       onboarding_completed_at = coalesce(profiles.onboarding_completed_at, excluded.onboarding_completed_at)`,
    [
      persona.id,
      persona.name,
      persona.age,
      persona.isOnboarded ? city.key : null,
      persona.isOnboarded ? city.name : null,
      persona.isOnboarded ? city.timezone : null,
      persona.isOnboarded ? city.lat : null,
      persona.isOnboarded ? city.lng : null,
      persona.isOnboarded ? persona.phone : null,
      persona.interests,
      JSON.stringify(persona.answers),
      persona.isOnboarded,
    ],
  )
}

async function seedMemories(db: Db, ai: AiProvider, persona: Persona): Promise<void> {
  if (persona.memories.length === 0) return
  const embeddings = await ai.embed(
    persona.memories.map((draft) =>
      memoryText({
        topic: draft.topic,
        summary: draft.summary,
        attributes: attributesToObject(draft.attributes),
      }),
    ),
  )
  await replaceMemories(db, persona.id, persona.memories, embeddings, 'seed')
  await refreshDerived(db, ai, persona.id)
}

/** Replaces the persona's unassigned future slots with fresh ones on the next two planning dates. */
async function seedAvailability(db: Db, persona: Persona, now: number): Promise<number> {
  const city = resolveCity(persona.cityKey)!
  await db.query(
    `update availability_slots set status = 'cancelled' where user_id = $1 and status in ('pending', 'paused') and starts_at > $2::timestamptz`,
    [persona.id, new Date(now).toISOString()],
  )
  const today = localDateOf(city.timezone, now)
  let inserted = 0
  for (const [offset, window] of persona.availability.entries()) {
    const date = addLocalDays(today, 2 + offset)
    const [sh, sm] = window.start.split(':').map(Number)
    const [eh, em] = window.end.split(':').map(Number)
    await db.query(
      `insert into availability_slots (user_id, "window", timezone) values ($1, tstzrange($2::timestamptz, $3::timestamptz, '[)'), $4)`,
      [
        persona.id,
        new Date(zonedTime(city.timezone, date, sh, sm)).toISOString(),
        new Date(zonedTime(city.timezone, date, eh, em)).toISOString(),
        city.timezone,
      ],
    )
    inserted += 1
  }
  return inserted
}

export async function seedDemoWorld(
  db: Db,
  ai: AiProvider,
  options: SeedOptions,
): Promise<SeedSummary> {
  let slots = 0
  for (const persona of personas) {
    await (options.ensureAuthUser ?? ((p: Persona) => ensureDemoAuthUser(db, p)))(persona)
    await upsertProfile(db, persona)
    await seedMemories(db, ai, persona)
    if (persona.isOnboarded) slots += await seedAvailability(db, persona, options.now)
  }
  const historyEvents = await seedHistory(db, options.now)
  return { people: personas.length, slots, historyEvents }
}
