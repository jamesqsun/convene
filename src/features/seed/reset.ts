import type { SupabaseClient } from '@supabase/supabase-js'
import type { Db } from '@/lib/db'
import { fakeAiProvider } from '@/features/ai/fake'
import { personas } from './people'
import { seedDemoWorld } from './seed'

type AuthAdmin = Pick<SupabaseClient['auth']['admin'], 'getUserById' | 'deleteUser' | 'createUser'>

// Explicit list: never cascade a truncate into Supabase-managed or unrelated tables.
export const resetTables = [
  'event_calendar_entries',
  'busy_blocks',
  'calendar_sources',
  'calendar_connections',
  'availability_weeks',
  'notification_deliveries',
  'notification_jobs',
  'interest_responses',
  'city_interest_jobs',
  'interest_prompts',
  'push_subscriptions',
  'participant_feedback',
  'event_feedback',
  'friendships',
  'user_date_assignments',
  'participant_reservations',
  'event_participants',
  'events',
  'planning_proposals',
  'planning_batches',
  'availability_slots',
  'preference_memories',
  'profiles',
] as const

/** Requires exclusive use of the project. Auth API operations cannot share the SQL transaction. */
export async function resetSeededWorld(db: Db, admin: AuthAdmin, password: string, now: number) {
  const users = await db.query<{ id: string }>('select id from auth.users order by id')
  // Catch mismatched API/DB configuration before deleting any users.
  for (const { id } of users) {
    const { data, error } = await admin.getUserById(id)
    if (error || data.user?.id !== id)
      throw new Error(
        `Auth preflight failed for ${id}; check that API and database target the same project`,
      )
  }
  for (const { id } of users) {
    const { error } = await admin.deleteUser(id)
    if (error) throw new Error(`Could not delete auth user ${id}: ${error.message}`)
  }
  for (const persona of personas) {
    const { data, error } = await admin.createUser({
      id: persona.id,
      email: persona.email,
      password,
      email_confirm: true,
    } as Parameters<AuthAdmin['createUser']>[0])
    if (error || data.user?.id !== persona.id)
      throw new Error(
        `Could not recreate ${persona.email}: ${error?.message ?? 'unexpected user id'}`,
      )
  }
  return db.transaction(async (tx) => {
    const actual = await tx.query<{ id: string }>('select id from auth.users order by id')
    if (
      actual
        .map((u) => u.id)
        .sort()
        .join() !==
      personas
        .map((p) => p.id)
        .sort()
        .join()
    )
      throw new Error(
        'Auth users do not match seed personas; stop concurrent writers and verify the project configuration',
      )
    await tx.exec(
      `truncate table ${resetTables.map((name) => `public.${name}`).join(', ')} restart identity`,
    )
    return seedDemoWorld(tx, fakeAiProvider(), { now, ensureAuthUser: async () => {} })
  })
}
