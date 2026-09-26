import { materializeWeeks } from '@/features/availability/weeks'
import { listBusyBlocks } from '@/features/calendar/store'
import {
  type SyncDeps,
  findLiveConflict,
  syncEventEntries,
  syncStaleCalendars,
} from '@/features/calendar/sync'
import type { Db } from '@/lib/db'
import type { Providers } from '@/lib/providers'
import { cutoffFor, localDayBounds } from '@/lib/time'
import { type DrainSummary, drainNotificationJobs } from '@/features/push/sender'
import { buildExplanation } from '../activities/explanation'
import {
  buildRankingInput,
  fallbackRanking,
  mergeRankings,
  validateRanking,
  windowMinutesOf,
} from '../activities/ranking'
import { generateCandidates, windowOf } from '../buckets/candidates'
import type { HistorySnapshot } from '../buckets/reconnection'
import { selectBuckets } from '../buckets/select'
import { partitionBucket } from '../groups/partition'
import { clipSlotsToDay, subtractBusy, withoutUsers } from '../time/segments'
import type { BucketMember, ProfileSnapshot, UserId } from '../types'
import { type VenuePlan, planVenueAndTime } from '../venues/plan-venue'
import type { CityContext } from '../venues/provider'
import {
  type BatchRow,
  type ProposalDraft,
  claimBatch,
  expireDeadSlots,
  finishBatch,
  listBatchStates,
  listCityClocks,
  listPlannedProposals,
  loadCityContext,
  loadExcludedUsers,
  loadPendingSlots,
  loadProfiles,
  markProposalFailed,
  markProposalPlanned,
  renewLease,
  saveSnapshot,
  upsertProposals,
} from './batches'
import { dueBatches, targetDateFor } from './due'
import { loadHistorySnapshot } from './history'
import { planningIdFor } from './planning-id'

/**
 * The planning driver (technical design sections 1 and 9). One tick: expire dead slots, run every
 * due city batch, drain notifications. One batch: recover any planned-but-uncommitted proposals,
 * build candidate buckets, select, partition, persist proposals, then plan and commit each group.
 * External calls (model, venues) happen between transactions, never inside one.
 */

export interface DriverDeps {
  db: Db
  providers: Providers
  workerId: string
  clock: () => number
  /** Encrypts stored calendar tokens; unused when no calendar provider is configured. */
  tokenSecret: string
}

export interface GroupOutcome {
  planningId: string
  status: 'committed' | 'failed' | 'skipped'
  eventId?: string
  error?: string
}

export interface BatchSummary {
  cityKey: string
  localDate: string
  pass: number
  status: 'done' | 'failed'
  groups: GroupOutcome[]
  error?: string
}

export interface TickSummary {
  expiredSlots: number
  weeksCarriedForward: number
  calendars: { synced: number; failed: number; entriesCreated: number; entriesRemoved: number }
  batches: BatchSummary[]
  notifications: DrainSummary
}

function calendarDeps(deps: DriverDeps): SyncDeps | null {
  const provider = deps.providers.calendar
  return provider ? { db: deps.db, provider, tokenSecret: deps.tokenSecret } : null
}

export async function runPlanningTick(deps: DriverDeps): Promise<TickSummary> {
  const now = deps.clock()
  const expiredSlots = await expireDeadSlots(deps.db, now)
  const weeksCarriedForward = (await materializeWeeks(deps.db, now)).weeks
  const calendar = calendarDeps(deps)
  const calendars = { synced: 0, failed: 0, entriesCreated: 0, entriesRemoved: 0 }
  if (calendar) Object.assign(calendars, await syncStaleCalendars(calendar, now))
  const cities = await listCityClocks(deps.db)
  const states = await listBatchStates(
    deps.db,
    cities.map((city) => targetDateFor(city, now)),
  )
  const batches: BatchSummary[] = []
  for (const due of dueBatches(cities, states, now)) {
    const batch = await claimBatch(deps.db, due, now, deps.workerId)
    if (batch) batches.push(await runBatch(deps, batch))
  }
  if (calendar) {
    const entries = await syncEventEntries(calendar, deps.clock())
    calendars.entriesCreated = entries.created
    calendars.entriesRemoved = entries.removed
  }
  const notifications = await drainNotificationJobs(deps.db, deps.providers.push, deps.clock())
  return { expiredSlots, weeksCarriedForward, calendars, batches, notifications }
}

export async function runBatch(deps: DriverDeps, batch: BatchRow): Promise<BatchSummary> {
  const base = { cityKey: batch.cityKey, localDate: batch.localDate, pass: batch.pass }
  try {
    const recovered = await recoverPlanned(deps, batch)
    const groups = await buildGroups(deps, batch)
    const outcomes = [...recovered]
    for (const group of groups) {
      await renewLease(deps.db, batch.id, deps.clock())
      outcomes.push(await planGroup(deps, batch, group))
    }
    await finishBatch(deps.db, batch.id, 'done', deps.clock(), null)
    return { ...base, status: 'done', groups: outcomes }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[planning] batch ${batch.cityKey}/${batch.localDate} failed:`, error)
    await finishBatch(deps.db, batch.id, 'failed', deps.clock(), message)
    return { ...base, status: 'failed', groups: [], error: message }
  }
}

/** Proposals that were fully planned but not committed before a crash: just commit them. */
async function recoverPlanned(deps: DriverDeps, batch: BatchRow): Promise<GroupOutcome[]> {
  const outcomes: GroupOutcome[] = []
  for (const planningId of await listPlannedProposals(deps.db, batch.id, batch.pass)) {
    outcomes.push(await commitProposal(deps, planningId))
  }
  return outcomes
}

async function snapshotFor(
  deps: DriverDeps,
  batch: BatchRow,
  userIds: UserId[],
): Promise<HistorySnapshot> {
  if (batch.snapshot) return batch.snapshot
  const snapshot = await loadHistorySnapshot(deps.db, userIds, batch.scoringTime)
  await saveSnapshot(deps.db, batch.id, snapshot)
  return snapshot
}

async function buildGroups(deps: DriverDeps, batch: BatchRow): Promise<ProposalDraft[]> {
  const day = localDayBounds(batch.timezone, batch.localDate)
  const slots = await loadPendingSlots(deps.db, batch.cityKey, day)
  const excluded = await loadExcludedUsers(deps.db, batch)
  const clipped = withoutUsers(clipSlotsToDay(slots, day, cutoffFor(batch.scoringTime)), excluded)
  const busy = await listBusyBlocks(deps.db, [...new Set(clipped.map((s) => s.userId))], {
    from: day.start,
    to: day.end,
  })
  const segments = subtractBusy(clipped, busy)
  const userIds = [...new Set(segments.map((segment) => segment.userId))]
  const snapshot = await snapshotFor(deps, batch, userIds)
  const profiles = await loadProfiles(deps.db, userIds)
  const drafts: ProposalDraft[] = []
  for (const bucket of selectBuckets(generateCandidates(segments), snapshot)) {
    for (const members of partitionBucket(bucket.members, profiles, snapshot)) {
      drafts.push({
        planningId: planningIdFor(batch.id, batch.pass, members),
        members,
        ...windowOf(members),
      })
    }
  }
  const statuses = await upsertProposals(deps.db, batch, drafts)
  // A proposal that already reached a terminal state in this pass is not re-planned.
  return drafts.filter((draft) => statuses.get(draft.planningId) === 'proposed')
}

async function rankFor(
  deps: DriverDeps,
  profiles: ProfileSnapshot[],
  window: { start: number; end: number },
  timeZone: string,
) {
  const windowMinutes = windowMinutesOf(window)
  const fallback = fallbackRanking(profiles, windowMinutes)
  try {
    const raw = await deps.providers.ai.rankActivities(
      buildRankingInput(profiles, window, timeZone),
    )
    return mergeRankings(validateRanking(raw, windowMinutes), fallback)
  } catch (error) {
    console.warn('[planning] activity ranking failed, using fallback:', error)
    return fallback
  }
}

function planJson(plan: VenuePlan, explanation: string): Record<string, unknown> {
  return {
    activity_id: plan.activity.id,
    activity_name: plan.activity.name,
    duration_minutes: plan.durationMinutes,
    explanation,
    venue: {
      provider: plan.venue.source,
      place_id: plan.venue.providerId,
      name: plan.venue.name,
      address: plan.venue.address,
      lat: plan.venue.lat,
      lng: plan.venue.lng,
      hours_verified: plan.isHoursVerified,
    },
    starts_at: new Date(plan.start).toISOString(),
    ends_at: new Date(plan.end).toISOString(),
  }
}

async function planGroup(
  deps: DriverDeps,
  batch: BatchRow,
  group: ProposalDraft,
): Promise<GroupOutcome> {
  const profileMap = await loadProfiles(
    deps.db,
    group.members.map((member: BucketMember) => member.userId),
  )
  const profiles = [...profileMap.values()]
  const window = { start: group.sharedStart, end: group.sharedEnd }
  const city: CityContext = await loadCityContext(deps.db, batch.cityKey)
  const ranked = await rankFor(deps, profiles, window, batch.timezone)
  const plan = await planVenueAndTime(ranked, window, deps.providers.venues, {
    timeZone: batch.timezone,
    city,
  })
  if (!plan) {
    await markProposalFailed(deps.db, group.planningId, 'no_venue')
    return { planningId: group.planningId, status: 'failed', error: 'no_venue' }
  }
  if (await hasCalendarConflict(deps, group, plan)) {
    await markProposalFailed(deps.db, group.planningId, 'calendar_conflict')
    return { planningId: group.planningId, status: 'failed', error: 'calendar_conflict' }
  }
  await markProposalPlanned(
    deps.db,
    group.planningId,
    planJson(plan, buildExplanation(profiles, plan.activity.name)),
  )
  return commitProposal(deps, group.planningId)
}

/** Live check against connected calendars right before booking, so a meeting added today is honoured. */
async function hasCalendarConflict(
  deps: DriverDeps,
  group: ProposalDraft,
  plan: VenuePlan,
): Promise<boolean> {
  const calendar = calendarDeps(deps)
  if (!calendar) return false
  for (const member of group.members) {
    try {
      if (
        await findLiveConflict(
          calendar,
          member.userId,
          { from: plan.start, to: plan.end },
          deps.clock(),
        )
      )
        return true
    } catch (error) {
      console.warn(`[planning] calendar check failed for ${member.userId}, booking anyway:`, error)
    }
  }
  return false
}

/** Runs the atomic commit; a rejected proposal is marked failed with the database's reason code. */
async function commitProposal(deps: DriverDeps, planningId: string): Promise<GroupOutcome> {
  try {
    const rows = await deps.db.query<{ id: string }>(
      'select commit_group_event($1, $2::timestamptz) as id',
      [planningId, new Date(deps.clock()).toISOString()],
    )
    return { planningId, status: 'committed', eventId: rows[0]!.id }
  } catch (error) {
    const code = error instanceof Error ? error.message.split('\n')[0]! : String(error)
    await markProposalFailed(deps.db, planningId, code)
    return { planningId, status: 'failed', error: code }
  }
}
