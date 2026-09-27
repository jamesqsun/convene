import { randomUUID } from 'node:crypto'
import type { Db } from '@/lib/db'
import { createMigratedDb } from '@/lib/db-pglite'
import type { SessionProvider } from '@/features/auth/session'

/**
 * Helpers for database tests. Each test file boots its own migrated PGlite via createTestDb();
 * the builders below insert minimal valid rows so tests can focus on one behaviour.
 */

export const createTestDb = createMigratedDb

export const toronto = { cityKey: 'ca:ontario:toronto', timezone: 'America/Toronto' }

/** Runs `fn` as a browser role inside one transaction (PGlite is single-session, so this is scoped). */
export async function asRole<T>(
  db: Db,
  role: 'anon' | 'authenticated',
  fn: (tx: Db) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`)
    return fn(tx)
  })
}

export interface UserOptions {
  name?: string
  cityKey?: string
  timezone?: string
  phone?: string
  interests?: string[]
  isOnboarded?: boolean
}

export async function createUser(db: Db, options: UserOptions = {}): Promise<string> {
  const id = randomUUID()
  await db.query('insert into auth.users (id, email) values ($1, $2)', [id, `${id}@example.test`])
  const isOnboarded = options.isOnboarded ?? true
  await db.query(
    `insert into profiles (id, name, age, city_key, city_name, city_timezone, city_lat, city_lng, phone_e164,
       interests, onboarding_completed_at)
     values ($1, $2, 30, $3, 'Toronto', $4, 43.7, -79.4, $5, $6, case when $7 then now() else null end)`,
    [
      id,
      options.name ?? 'Test Person',
      options.cityKey ?? toronto.cityKey,
      options.timezone ?? toronto.timezone,
      options.phone ?? '+14165550100',
      options.interests ?? ['coffee'],
      isOnboarded,
    ],
  )
  return id
}

export interface SlotRef {
  id: string
  revision: number
}

export async function createSlot(
  db: Db,
  userId: string,
  startIso: string,
  endIso: string,
  status = 'pending',
): Promise<SlotRef> {
  const rows = await db.query<SlotRef>(
    `insert into availability_slots (user_id, "window", timezone, status)
     values ($1, tstzrange($2::timestamptz, $3::timestamptz, '[)'), $4, $5)
     returning id, revision`,
    [userId, startIso, endIso, toronto.timezone, status],
  )
  return rows[0]!
}

export async function createBatch(db: Db, localDate: string, city = toronto): Promise<string> {
  const rows = await db.query<{ id: string }>(
    `insert into planning_batches (city_key, timezone, local_date, status, pass, scoring_time)
     values ($1, $2, $3, 'running', 1, now()) returning id`,
    [city.cityKey, city.timezone, localDate],
  )
  return rows[0]!.id
}

export interface Member {
  user_id: string
  slot_id: string
  revision: number
}

export function planFor(startIso: string, endIso: string, overrides: Record<string, unknown> = {}) {
  return {
    activity_id: 'coffee',
    activity_name: 'Coffee',
    duration_minutes: 60,
    explanation: 'You both like coffee.',
    venue: {
      provider: 'fictional',
      place_id: 'demo-1',
      name: '(Demo) Cafe',
      address: '1 Main St',
      lat: 43.7,
      lng: -79.4,
      hours_verified: false,
    },
    starts_at: startIso,
    ends_at: endIso,
    ...overrides,
  }
}

export interface ProposalOptions {
  batchId: string
  members: Member[]
  startIso: string
  endIso: string
  status?: 'proposed' | 'planned'
  plan?: Record<string, unknown> | null
}

export async function createProposal(db: Db, options: ProposalOptions): Promise<string> {
  const planningId = `plan-${randomUUID()}`
  const status = options.status ?? 'planned'
  const plan = options.plan === undefined ? planFor(options.startIso, options.endIso) : options.plan
  await db.query(
    `insert into planning_proposals (planning_id, batch_id, pass, members, shared_start, shared_end, plan, status)
     values ($1, $2, 1, $3::jsonb, $4, $5, $6::jsonb, $7)`,
    [
      planningId,
      options.batchId,
      JSON.stringify(options.members),
      options.startIso,
      options.endIso,
      plan ? JSON.stringify(plan) : null,
      status,
    ],
  )
  return planningId
}

export async function commit(db: Db, planningId: string, nowIso: string): Promise<string> {
  const rows = await db.query<{ id: string }>(
    'select commit_group_event($1, $2::timestamptz) as id',
    [planningId, nowIso],
  )
  return rows[0]!.id
}

export interface BookingOptions {
  localDate: string
  startIso: string
  endIso: string
  nowIso: string
  users: string[]
  slotStartIso?: string
  slotEndIso?: string
}

/** Books one event for the given users, creating one slot each around the event. */
export async function bookGroup(
  db: Db,
  options: BookingOptions,
): Promise<{ eventId: string; members: Member[] }> {
  const batchId = await createBatch(db, options.localDate)
  const members: Member[] = []
  for (const userId of options.users) {
    const slot = await createSlot(
      db,
      userId,
      options.slotStartIso ?? options.startIso,
      options.slotEndIso ?? options.endIso,
    )
    members.push({ user_id: userId, slot_id: slot.id, revision: slot.revision })
  }
  const planningId = await createProposal(db, {
    batchId,
    members,
    startIso: options.startIso,
    endIso: options.endIso,
  })
  const eventId = await commit(db, planningId, options.nowIso)
  return { eventId, members }
}

/** Rewrites an event's timing so it reads as already completed. */
export async function backdateEvent(db: Db, eventId: string, endedAtIso: string): Promise<void> {
  await db.query(
    `update events set starts_at = $2::timestamptz - interval '1 hour', ends_at = $2::timestamptz where id = $1`,
    [eventId, endedAtIso],
  )
}

export async function count(
  db: Db,
  table: string,
  where = 'true',
  params: unknown[] = [],
): Promise<number> {
  const rows = await db.query<{ n: number }>(
    `select count(*)::int as n from ${table} where ${where}`,
    params,
  )
  return rows[0]!.n
}

/** A session provider that always resolves to `userId` (or nobody when null). */
export function stubSessionProvider(userId: string | null): SessionProvider {
  return {
    kind: 'demo',
    signUp: async () => ({ userId: '', isEmailConfirmationPending: false }),
    signIn: async () => '',
    startGoogleSignIn: async () => '',
    completeGoogleSignIn: async () => '',
    signOut: async () => undefined,
    userIdFrom: async () => userId,
  }
}

/** A same-origin JSON request the route wrappers accept. */
export function jsonRequest(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request(`http://localhost:3000${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
      host: 'localhost:3000',
      origin: 'http://localhost:3000',
      ...headers,
    },
  })
}

export function withParams<P extends Record<string, string>>(params: P): { params: Promise<P> } {
  return { params: Promise.resolve(params) }
}
