import type { Db } from '@/lib/db'
import { day } from '@/lib/time'
import type { BusyBlock, CalendarProvider } from './provider'
import {
  accessTokenFor,
  listConnections,
  listSources,
  loadConnection,
  recordSync,
  replaceBusyBlocks,
  replaceSources,
} from './store'

/**
 * Keeps our copy of a person's calendars fresh and mirrors matched hangouts into their Convene
 * calendar. Everything here is best effort and bounded; failures are recorded on the connection
 * and never block planning.
 */

export const busyLookaheadMs = 21 * day
export const busyLookbehindMs = 1 * day
export const staleAfterMs = 30 * 60_000
export const maxSyncsPerTick = 25

export interface SyncDeps {
  db: Db
  provider: CalendarProvider
  tokenSecret: string
}

async function timeZoneFor(db: Db, userId: string): Promise<string> {
  const rows = await db.query<{ city_timezone: string | null }>(
    'select city_timezone from profiles where id = $1',
    [userId],
  )
  return rows[0]?.city_timezone ?? 'UTC'
}

/** Refreshes calendars, the Convene calendar id, and cached busy time for one person. */
export async function syncUserCalendar(
  deps: SyncDeps,
  userId: string,
  now: number,
): Promise<{ busyBlocks: number }> {
  const { db, provider } = deps
  const connection = await loadConnection(db, userId)
  if (!connection) throw new Error('No calendar connection')
  try {
    const accessToken = await accessTokenFor(db, provider, userId, deps.tokenSecret, now)
    const timeZone = await timeZoneFor(db, userId)
    const conveneCalendarId = await provider.ensureConveneCalendar(
      accessToken,
      timeZone,
      connection.conveneCalendarId,
    )
    await replaceSources(db, userId, await provider.listCalendars(accessToken), conveneCalendarId)
    const selected = (await listSources(db, userId))
      .filter((source) => source.isSelected)
      .map((source) => source.id)
    const range = { from: now - busyLookbehindMs, to: now + busyLookaheadMs }
    const blocks =
      selected.length > 0 ? await provider.listBusy(accessToken, selected, range, timeZone) : []
    await replaceBusyBlocks(db, userId, blocks, range)
    await recordSync(db, userId, now, null, conveneCalendarId)
    return { busyBlocks: blocks.length }
  } catch (error) {
    await recordSync(db, userId, now, error instanceof Error ? error.message : String(error))
    throw error
  }
}

/** Syncs connections whose cache is older than the staleness threshold, a bounded number per tick. */
export async function syncStaleCalendars(
  deps: SyncDeps,
  now: number,
): Promise<{ synced: number; failed: number }> {
  const summary = { synced: 0, failed: 0 }
  const stale = (await listConnections(deps.db))
    .filter((c) => c.lastSyncedAt === null || now - c.lastSyncedAt > staleAfterMs)
    .slice(0, maxSyncsPerTick)
  for (const connection of stale) {
    try {
      await syncUserCalendar(deps, connection.userId, now)
      summary.synced += 1
    } catch (error) {
      summary.failed += 1
      console.warn(`[calendar] sync failed for ${connection.userId}:`, error)
    }
  }
  return summary
}

/** Live check right before booking: the first busy block overlapping the range, or null. */
export async function findLiveConflict(
  deps: SyncDeps,
  userId: string,
  range: { from: number; to: number },
  now: number,
): Promise<BusyBlock | null> {
  const connection = await loadConnection(deps.db, userId)
  if (!connection) return null
  const selected = (await listSources(deps.db, userId))
    .filter((source) => source.isSelected)
    .map((source) => source.id)
  if (selected.length === 0) return null
  const accessToken = await accessTokenFor(deps.db, deps.provider, userId, deps.tokenSecret, now)
  const timeZone = await timeZoneFor(deps.db, userId)
  const blocks = await deps.provider.listBusy(accessToken, selected, range, timeZone)
  return blocks.find((block) => block.startsAt < range.to && block.endsAt > range.from) ?? null
}

interface PendingEntry {
  event_id: string
  user_id: string
  activity_name: string
  venue_name: string
  venue_address: string
  starts_at: Date
  ends_at: Date
  timezone: string
  convene_calendar_id: string | null
}

async function writeEntry(deps: SyncDeps, entry: PendingEntry, now: number): Promise<void> {
  const calendarId = entry.convene_calendar_id
  if (!calendarId) return
  try {
    const accessToken = await accessTokenFor(
      deps.db,
      deps.provider,
      entry.user_id,
      deps.tokenSecret,
      now,
    )
    const externalEventId = await deps.provider.createEvent(accessToken, calendarId, {
      summary: `Convene: ${entry.activity_name}`,
      description: `Planned by Convene. Details and who is coming are in the app.`,
      location: `${entry.venue_name}, ${entry.venue_address}`,
      startsAt: entry.starts_at.getTime(),
      endsAt: entry.ends_at.getTime(),
      timeZone: entry.timezone,
    })
    await deps.db.query(
      `insert into event_calendar_entries (event_id, user_id, calendar_id, external_event_id, status)
       values ($1, $2, $3, $4, 'created')
       on conflict (event_id, user_id) do update set calendar_id = excluded.calendar_id, external_event_id = excluded.external_event_id, status = 'created', last_error = null, updated_at = now()`,
      [entry.event_id, entry.user_id, calendarId, externalEventId],
    )
  } catch (error) {
    await deps.db.query(
      `insert into event_calendar_entries (event_id, user_id, calendar_id, external_event_id, status, last_error)
       values ($1, $2, $3, '', 'failed', $4)
       on conflict (event_id, user_id) do update set status = 'failed', last_error = excluded.last_error, updated_at = now()`,
      [
        entry.event_id,
        entry.user_id,
        calendarId,
        error instanceof Error ? error.message : String(error),
      ],
    )
  }
}

/**
 * Mirrors upcoming hangouts into connected people's Convene calendars and removes entries for
 * cancelled events or withdrawn participants. Idempotent: each tick only touches what changed.
 */
export async function syncEventEntries(
  deps: SyncDeps,
  now: number,
): Promise<{ created: number; removed: number }> {
  const nowIso = new Date(now).toISOString()
  const pending = await deps.db.query<PendingEntry>(
    `select e.id as event_id, ep.user_id, e.activity_name, coalesce(e.venue->>'name', '') as venue_name, coalesce(e.venue->>'address', '') as venue_address,
       e.starts_at, e.ends_at, e.timezone, c.convene_calendar_id
     from event_participants ep
     join events e on e.id = ep.event_id and e.status = 'scheduled' and e.starts_at > $1::timestamptz
     join calendar_connections c on c.user_id = ep.user_id
     left join event_calendar_entries x on x.event_id = ep.event_id and x.user_id = ep.user_id
     where ep.withdrawn_at is null and (x.event_id is null or x.status = 'failed')
     order by e.starts_at limit 50`,
    [nowIso],
  )
  for (const entry of pending) await writeEntry(deps, entry, now)

  const removable = await deps.db.query<{
    event_id: string
    user_id: string
    calendar_id: string
    external_event_id: string
  }>(
    `select x.event_id, x.user_id, x.calendar_id, x.external_event_id from event_calendar_entries x
     join events e on e.id = x.event_id
     join event_participants ep on ep.event_id = x.event_id and ep.user_id = x.user_id
     where x.status = 'created' and (e.status = 'cancelled' or ep.withdrawn_at is not null) limit 50`,
  )
  let removed = 0
  for (const entry of removable) {
    try {
      const accessToken = await accessTokenFor(
        deps.db,
        deps.provider,
        entry.user_id,
        deps.tokenSecret,
        now,
      )
      await deps.provider.deleteEvent(accessToken, entry.calendar_id, entry.external_event_id)
      await deps.db.query(
        "update event_calendar_entries set status = 'cancelled', updated_at = now() where event_id = $1 and user_id = $2",
        [entry.event_id, entry.user_id],
      )
      removed += 1
    } catch (error) {
      console.warn(`[calendar] could not remove event for ${entry.user_id}:`, error)
    }
  }
  return { created: pending.filter((p) => p.convene_calendar_id).length, removed }
}
