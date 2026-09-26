import type { Db } from '@/lib/db'
import { type DayBounds, minute } from '@/lib/time'
import type { HistorySnapshot } from '../buckets/reconnection'
import type { BucketMember, ProfileSnapshot, SlotRow, UserId } from '../types'
import type { CityContext } from '../venues/provider'
import type { BatchState, CityClock, DueBatch } from './due'

/** SQL for the batch driver: claims, leases, slot and profile loading, proposals, and slot expiry. */

export const defaultLeaseMs = 10 * minute
export const maxFailedGroupsPerUser = 2
export const memoriesPerProfile = 5

export interface BatchRow {
  id: string
  cityKey: string
  timezone: string
  localDate: string
  pass: number
  attempts: number
  scoringTime: number
  snapshot: HistorySnapshot | null
}

interface BatchDbRow {
  id: string
  city_key: string
  timezone: string
  local_date: string
  pass: number
  attempts: number
  scoring_time: Date
  snapshot: HistorySnapshot | null
}

function toBatchRow(row: BatchDbRow): BatchRow {
  return {
    id: row.id,
    cityKey: row.city_key,
    timezone: row.timezone,
    localDate: row.local_date,
    pass: row.pass,
    attempts: row.attempts,
    scoringTime: row.scoring_time.getTime(),
    snapshot: row.snapshot,
  }
}

export async function listCityClocks(db: Db): Promise<CityClock[]> {
  const rows = await db.query<{ city_key: string; city_timezone: string }>(
    `select distinct city_key, city_timezone from profiles
     where onboarding_completed_at is not null and city_key is not null
     order by city_key`,
  )
  return rows.map((row) => ({ cityKey: row.city_key, timezone: row.city_timezone }))
}

export async function listBatchStates(
  db: Db,
  localDates: readonly string[],
): Promise<BatchState[]> {
  const rows = await db.query<{
    city_key: string
    local_date: string
    status: BatchState['status']
    attempts: number
    finished_at: Date | null
    lease_expires_at: Date | null
  }>(
    `select city_key, local_date::text as local_date, status, attempts, finished_at, lease_expires_at
     from planning_batches where local_date = any($1::date[])`,
    [[...localDates]],
  )
  return rows.map((row) => ({
    cityKey: row.city_key,
    localDate: row.local_date,
    status: row.status,
    attempts: row.attempts,
    finishedAt: row.finished_at?.getTime() ?? null,
    leaseExpiresAt: row.lease_expires_at?.getTime() ?? null,
  }))
}

/**
 * Takes the batch for a city/date in one statement. A live lease held by someone else yields null.
 * Re-claiming a crashed pass keeps its pass number, scoring time, and snapshot; claiming after a
 * finished or failed pass starts a new pass with a fresh scoring time.
 */
export async function claimBatch(
  db: Db,
  due: DueBatch,
  now: number,
  workerId: string,
  leaseMs = defaultLeaseMs,
): Promise<BatchRow | null> {
  const nowIso = new Date(now).toISOString()
  const leaseIso = new Date(now + leaseMs).toISOString()
  const rows = await db.query<BatchDbRow>(
    `insert into planning_batches (city_key, timezone, local_date, status, pass, lease_owner, lease_expires_at, attempts, scoring_time)
     values ($1, $2, $3::date, 'running', 1, $4, $5::timestamptz, 1, $6::timestamptz)
     on conflict (city_key, local_date) do update set
       status = 'running',
       lease_owner = excluded.lease_owner,
       lease_expires_at = excluded.lease_expires_at,
       pass = case when planning_batches.status = 'running' then planning_batches.pass else planning_batches.pass + 1 end,
       attempts = case when planning_batches.status in ('running', 'failed') then planning_batches.attempts + 1 else 1 end,
       scoring_time = case when planning_batches.status = 'running' then planning_batches.scoring_time else excluded.scoring_time end,
       snapshot = case when planning_batches.status = 'running' then planning_batches.snapshot else null end,
       finished_at = null,
       last_error = null
     where planning_batches.status <> 'running'
        or planning_batches.lease_expires_at is null
        or planning_batches.lease_expires_at < $6::timestamptz
     returning id, city_key, timezone, local_date::text as local_date, pass, attempts, scoring_time, snapshot`,
    [due.cityKey, due.timezone, due.localDate, workerId, leaseIso, nowIso],
  )
  return rows[0] ? toBatchRow(rows[0]) : null
}

export async function renewLease(
  db: Db,
  batchId: string,
  now: number,
  leaseMs = defaultLeaseMs,
): Promise<void> {
  await db.query('update planning_batches set lease_expires_at = $2::timestamptz where id = $1', [
    batchId,
    new Date(now + leaseMs).toISOString(),
  ])
}

export async function saveSnapshot(
  db: Db,
  batchId: string,
  snapshot: HistorySnapshot,
): Promise<void> {
  await db.query('update planning_batches set snapshot = $2::jsonb where id = $1', [
    batchId,
    JSON.stringify(snapshot),
  ])
}

export async function finishBatch(
  db: Db,
  batchId: string,
  status: 'done' | 'failed',
  now: number,
  error: string | null,
): Promise<void> {
  await db.query(
    `update planning_batches set status = $2, finished_at = $3::timestamptz, last_error = $4, lease_owner = null, lease_expires_at = null where id = $1`,
    [batchId, status, new Date(now).toISOString(), error],
  )
}

export async function loadPendingSlots(
  db: Db,
  cityKey: string,
  day: DayBounds,
): Promise<SlotRow[]> {
  const rows = await db.query<{
    id: string
    user_id: string
    starts_at: Date
    ends_at: Date
    revision: number
  }>(
    `select s.id, s.user_id, s.starts_at, s.ends_at, s.revision
     from availability_slots s join profiles p on p.id = s.user_id
     where p.city_key = $1 and p.onboarding_completed_at is not null and s.status = 'pending'
       and s."window" && tstzrange($2::timestamptz, $3::timestamptz, '[)')
     order by s.id`,
    [cityKey, new Date(day.start).toISOString(), new Date(day.end).toISOString()],
  )
  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    startsAt: row.starts_at.getTime(),
    endsAt: row.ends_at.getTime(),
    revision: row.revision,
  }))
}

/** People already assigned on the date, plus people whose groups failed too often in this batch. */
export async function loadExcludedUsers(db: Db, batch: BatchRow): Promise<Set<UserId>> {
  const rows = await db.query<{ user_id: string }>(
    `select user_id from user_date_assignments where local_date = $1::date
     union
     select (m->>'user_id')::uuid as user_id
       from planning_proposals pp, jsonb_array_elements(pp.members) m
       where pp.batch_id = $2 and pp.status = 'failed'
       group by 1 having count(*) >= $3`,
    [batch.localDate, batch.id, maxFailedGroupsPerUser],
  )
  return new Set(rows.map((row) => row.user_id))
}

interface ProfileDbRow {
  id: string
  interests: string[]
  embedding: string | null
  embedding_stale: boolean
  memories: { topic: string; summary: string }[]
}

/** Profiles for grouping and ranking. A stale embedding is treated as absent so it cannot mislead. */
export async function loadProfiles(
  db: Db,
  userIds: readonly UserId[],
): Promise<Map<UserId, ProfileSnapshot>> {
  if (userIds.length === 0) return new Map()
  const rows = await db.query<ProfileDbRow>(
    `select p.id, p.interests, p.profile_embedding::text as embedding, p.embedding_stale,
       coalesce((select jsonb_agg(jsonb_build_object('topic', m.topic, 'summary', m.summary) order by m.confidence desc, m.created_at)
                 from (select topic, summary, confidence, created_at from preference_memories
                       where user_id = p.id order by confidence desc, created_at limit $2) m), '[]'::jsonb) as memories
     from profiles p where p.id = any($1::uuid[])`,
    [[...userIds], memoriesPerProfile],
  )
  return new Map(
    rows.map((row) => [
      row.id,
      {
        userId: row.id,
        embedding:
          row.embedding && !row.embedding_stale ? (JSON.parse(row.embedding) as number[]) : null,
        interests: row.interests,
        memories: row.memories,
      },
    ]),
  )
}

export async function loadCityContext(db: Db, cityKey: string): Promise<CityContext> {
  const rows = await db.query<{ name: string; lat: number; lng: number }>(
    `select min(city_name) as name, avg(city_lat)::float8 as lat, avg(city_lng)::float8 as lng from profiles where city_key = $1`,
    [cityKey],
  )
  const row = rows[0]
  if (!row || row.lat === null) throw new Error(`No profiles found for city ${cityKey}`)
  return { name: row.name, lat: row.lat, lng: row.lng }
}

export interface ProposalDraft {
  planningId: string
  members: BucketMember[]
  sharedStart: number
  sharedEnd: number
}

/** Persists proposals before any external call; returns the current status of each (existing rows win). */
export async function upsertProposals(
  db: Db,
  batch: BatchRow,
  drafts: readonly ProposalDraft[],
): Promise<Map<string, string>> {
  const statuses = new Map<string, string>()
  for (const draft of drafts) {
    const members = draft.members.map((m) => ({
      user_id: m.userId,
      slot_id: m.slotId,
      revision: m.revision,
    }))
    const rows = await db.query<{ status: string }>(
      `insert into planning_proposals (planning_id, batch_id, pass, members, shared_start, shared_end)
       values ($1, $2, $3, $4::jsonb, $5::timestamptz, $6::timestamptz)
       on conflict (planning_id) do update set updated_at = now()
       returning status`,
      [
        draft.planningId,
        batch.id,
        batch.pass,
        JSON.stringify(members),
        new Date(draft.sharedStart).toISOString(),
        new Date(draft.sharedEnd).toISOString(),
      ],
    )
    statuses.set(draft.planningId, rows[0]!.status)
  }
  return statuses
}

export async function markProposalPlanned(
  db: Db,
  planningId: string,
  plan: Record<string, unknown>,
): Promise<void> {
  await db.query(
    "update planning_proposals set status = 'planned', plan = $2::jsonb, attempts = attempts + 1 where planning_id = $1",
    [planningId, JSON.stringify(plan)],
  )
}

export async function markProposalFailed(db: Db, planningId: string, error: string): Promise<void> {
  await db.query(
    "update planning_proposals set status = 'failed', last_error = $2, attempts = attempts + 1 where planning_id = $1",
    [planningId, error],
  )
}

export async function listPlannedProposals(
  db: Db,
  batchId: string,
  pass: number,
): Promise<string[]> {
  const rows = await db.query<{ planning_id: string }>(
    "select planning_id from planning_proposals where batch_id = $1 and pass = $2 and status = 'planned' order by planning_id",
    [batchId, pass],
  )
  return rows.map((row) => row.planning_id)
}

/** Expires pending slots that can no longer hold a minimum-overlap window 48 hours out. */
export async function expireDeadSlots(db: Db, now: number): Promise<number> {
  const rows = await db.query<{ id: string }>(
    `update availability_slots set status = 'expired'
     where status = 'pending' and ends_at - interval '60 minutes' < $1::timestamptz + interval '48 hours'
     returning id`,
    [new Date(now).toISOString()],
  )
  return rows.length
}
