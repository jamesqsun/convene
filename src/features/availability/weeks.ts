import { type BusyInterval, listBusyBlocks } from '@/features/calendar/store'
import { minOverlapMs } from '@/features/planning/types'
import type { Db } from '@/lib/db'
import { HttpError } from '@/lib/http'
import {
  addLocalDays,
  advanceAssignmentMs,
  localClockOf,
  localDateOf,
  minute,
  zonedTime,
} from '@/lib/time'
import { type SlotState, slotStateFor } from './slot-state'
import { type Slot, isReopenable } from './store'
import { isWeekStart, weekStartOf } from './week-grid'

export { isWeekStart, weekStartOf }

/**
 * Weekly availability. A week is Monday to Sunday in the person's city time zone. Windows are
 * day-of-week plus clock times; saving a week turns them into the dated slots the planner already
 * understands. Weeks nobody set are copied from the most recent week that was, unless the person
 * turned that off.
 */

export interface WeekWindow {
  /** 0 = Monday ... 6 = Sunday. */
  day: number
  /** HH:MM; the end may be 24:00 for midnight. */
  start: string
  end: string
}

export interface WeekView {
  weekStart: string
  status: 'confirmed' | 'auto' | 'none'
  copiedFrom: string | null
  timeZone: string
  /** The seven local midnights, then the following Monday's, as instants. */
  dayStarts: number[]
  slots: (Slot & { state: SlotState })[]
  busy: BusyInterval[]
  events: { eventId: string; activityName: string; startsAt: number; endsAt: number }[]
  /** Windows must end after this instant to be plannable. */
  plannableAfter: number
}

const weekDays = 7

function clockToMinutes(clock: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(clock)
  if (!match) throw new HttpError(400, 'invalid_window', `Bad clock time ${clock}`)
  const minutes = Number(match[1]) * 60 + Number(match[2])
  if (minutes > 24 * 60) throw new HttpError(400, 'invalid_window', `Bad clock time ${clock}`)
  return minutes
}

function instantFor(weekStart: string, day: number, minutes: number, timeZone: string): number {
  const date = addLocalDays(weekStart, day + Math.floor(minutes / (24 * 60)))
  const remainder = minutes % (24 * 60)
  return zonedTime(timeZone, date, Math.floor(remainder / 60), remainder % 60)
}

/** Validated, merged, sorted absolute ranges for a week's windows. */
export function windowsToRanges(
  weekStart: string,
  windows: readonly WeekWindow[],
  timeZone: string,
): { start: number; end: number }[] {
  const ranges = windows
    .map((window) => {
      if (window.day < 0 || window.day >= weekDays)
        throw new HttpError(400, 'invalid_window', 'Day must be 0 to 6')
      const start = instantFor(weekStart, window.day, clockToMinutes(window.start), timeZone)
      const end = instantFor(weekStart, window.day, clockToMinutes(window.end), timeZone)
      if (end <= start)
        throw new HttpError(400, 'invalid_window', 'A window must end after it starts')
      return { start, end }
    })
    .sort((a, b) => a.start - b.start)
  const merged: { start: number; end: number }[] = []
  for (const range of ranges) {
    const last = merged[merged.length - 1]
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end)
    else merged.push({ ...range })
  }
  for (const range of merged) {
    if (range.end - range.start < minOverlapMs)
      throw new HttpError(400, 'too_short', 'Each window must be at least one hour')
  }
  return merged
}

/** The reverse mapping, used to carry a week's pattern forward. */
export function rangesToWindows(
  weekStart: string,
  ranges: readonly { start: number; end: number }[],
  timeZone: string,
): WeekWindow[] {
  const weekStartInstant = zonedTime(timeZone, weekStart)
  return ranges.map((range) => {
    const day = Math.max(
      0,
      Math.min(weekDays - 1, Math.floor((range.start - weekStartInstant) / (24 * 60 * minute))),
    )
    const dayStart = zonedTime(timeZone, addLocalDays(weekStart, day))
    const end =
      range.end === zonedTime(timeZone, addLocalDays(weekStart, day + 1))
        ? '24:00'
        : localClockOf(timeZone, range.end)
    return { day, start: localClockOf(timeZone, Math.max(range.start, dayStart)), end }
  })
}

interface SlotRow {
  id: string
  starts_at: Date
  ends_at: Date
  timezone: string
  status: Slot['status']
  revision: number
  assigned_event_id: string | null
}

const slotColumns = 'id, starts_at, ends_at, timezone, status, revision, assigned_event_id'

function toSlot(row: SlotRow): Slot {
  return {
    id: row.id,
    startsAt: row.starts_at.getTime(),
    endsAt: row.ends_at.getTime(),
    timezone: row.timezone,
    status: row.status,
    revision: row.revision,
    assignedEventId: row.assigned_event_id,
  }
}

/**
 * A week's slots. Expired slots are included: they are still the person's pattern (the tick expires
 * last week's windows before carry-forward runs) and read as "unfilled" in the week view.
 * Cancelled slots are not: the person removed them or a withdrawal closed them.
 */
async function slotsInWeek(
  db: Db,
  userId: string,
  weekStart: string,
  timeZone: string,
): Promise<Slot[]> {
  const from = new Date(zonedTime(timeZone, weekStart)).toISOString()
  const to = new Date(zonedTime(timeZone, addLocalDays(weekStart, weekDays))).toISOString()
  const rows = await db.query<SlotRow>(
    `select ${slotColumns} from availability_slots where user_id = $1 and starts_at >= $2::timestamptz and starts_at < $3::timestamptz
       and status in ('pending', 'paused', 'filled', 'expired') order by starts_at`,
    [userId, from, to],
  )
  return rows.map(toSlot)
}

async function weekRow(
  db: Db,
  userId: string,
  weekStart: string,
): Promise<{ status: 'confirmed' | 'auto'; copiedFrom: string | null } | null> {
  const rows = await db.query<{ status: 'confirmed' | 'auto'; copied_from: string | null }>(
    'select status, copied_from::text as copied_from from availability_weeks where user_id = $1 and week_start = $2::date',
    [userId, weekStart],
  )
  return rows[0] ? { status: rows[0].status, copiedFrom: rows[0].copied_from } : null
}

export async function loadWeek(
  db: Db,
  userId: string,
  weekStart: string,
  timeZone: string,
  now: number,
): Promise<WeekView> {
  const dayStarts = Array.from({ length: weekDays + 1 }, (_, day) =>
    zonedTime(timeZone, addLocalDays(weekStart, day)),
  )
  const range = { from: dayStarts[0]!, to: dayStarts[weekDays]! }
  const slots = await slotsInWeek(db, userId, weekStart, timeZone)
  const events = await db.query<{
    id: string
    activity_name: string
    starts_at: Date
    ends_at: Date
  }>(
    `select e.id, e.activity_name, e.starts_at, e.ends_at from events e
     join event_participants ep on ep.event_id = e.id and ep.user_id = $1 and ep.withdrawn_at is null
     where e.status = 'scheduled' and e.starts_at >= $2::timestamptz and e.starts_at < $3::timestamptz`,
    [userId, new Date(range.from).toISOString(), new Date(range.to).toISOString()],
  )
  const week = await weekRow(db, userId, weekStart)
  return {
    weekStart,
    status: week?.status ?? 'none',
    copiedFrom: week?.copiedFrom ?? null,
    timeZone,
    dayStarts,
    slots: slots.map((slot) => ({ ...slot, state: slotStateFor(slot, now) })),
    busy: (await listBusyBlocks(db, [userId], range)).get(userId) ?? [],
    events: events.map((event) => ({
      eventId: event.id,
      activityName: event.activity_name,
      startsAt: event.starts_at.getTime(),
      endsAt: event.ends_at.getTime(),
    })),
    plannableAfter: now + advanceAssignmentMs + minOverlapMs,
  }
}

export interface SaveWeekResult {
  created: number
  kept: number
  removed: number
  skippedTooSoon: number
}

function overlaps(a: { start: number; end: number }, slot: Slot): boolean {
  return a.start < slot.endsAt && a.end > slot.startsAt
}

async function insertSlot(
  db: Db,
  userId: string,
  range: { start: number; end: number },
  timeZone: string,
  isAuto: boolean,
): Promise<boolean> {
  try {
    await db.query(
      `insert into availability_slots (user_id, "window", timezone) values ($1, tstzrange($2::timestamptz, $3::timestamptz, '[)'), $4)`,
      [userId, new Date(range.start).toISOString(), new Date(range.end).toISOString(), timeZone],
    )
    return true
  } catch (error) {
    // Carry-forward tolerates collisions with slots the person already has; explicit saves do not.
    if (isAuto && error instanceof Error && /exclusion constraint/.test(error.message)) return false
    throw error
  }
}

/**
 * Makes the week's slots match the submitted windows: unchanged pending windows are kept, other
 * pending or paused slots are cancelled, new windows are created, filled slots are never touched
 * (a window that overlaps one is kept as the filled slot), and windows too soon to plan are skipped.
 */
export async function saveWeek(
  db: Db,
  userId: string,
  weekStart: string,
  windows: readonly WeekWindow[],
  timeZone: string,
  now: number,
): Promise<SaveWeekResult> {
  const desired = windowsToRanges(weekStart, windows, timeZone)
  const existing = await slotsInWeek(db, userId, weekStart, timeZone)
  const result: SaveWeekResult = { created: 0, kept: 0, removed: 0, skippedTooSoon: 0 }
  return db.transaction(async (tx) => {
    const matched = new Set<string>()
    for (const slot of existing.filter((s) => s.status !== 'filled')) {
      const isWanted = desired.some(
        (range) => range.start === slot.startsAt && range.end === slot.endsAt,
      )
      if (isWanted) {
        matched.add(`${slot.startsAt}-${slot.endsAt}`)
        result.kept += 1
        continue
      }
      await tx.query(
        "update availability_slots set status = 'cancelled', revision = revision + 1 where id = $1",
        [slot.id],
      )
      result.removed += 1
    }
    const filled = existing.filter((s) => s.status === 'filled')
    for (const range of desired) {
      if (matched.has(`${range.start}-${range.end}`)) continue
      if (filled.some((slot) => overlaps(range, slot))) {
        result.kept += 1
        continue
      }
      if (range.end < now + advanceAssignmentMs + minOverlapMs) {
        result.skippedTooSoon += 1
        continue
      }
      await insertSlot(tx, userId, range, timeZone, false)
      result.created += 1
    }
    await tx.query(
      `insert into availability_weeks (user_id, week_start, status, copied_from) values ($1, $2::date, 'confirmed', null)
       on conflict (user_id, week_start) do update set status = 'confirmed', copied_from = null`,
      [userId, weekStart],
    )
    return result
  })
}

interface RepeatingProfile {
  id: string
  city_timezone: string
}

async function latestWeekBefore(db: Db, userId: string, weekStart: string): Promise<string | null> {
  const rows = await db.query<{ week_start: string }>(
    'select week_start::text as week_start from availability_weeks where user_id = $1 and week_start < $2::date order by week_start desc limit 1',
    [userId, weekStart],
  )
  return rows[0]?.week_start ?? null
}

async function carryForward(
  db: Db,
  profile: RepeatingProfile,
  targetWeek: string,
  sourceWeek: string,
  now: number,
): Promise<number> {
  const timeZone = profile.city_timezone
  const source = await slotsInWeek(db, profile.id, sourceWeek, timeZone)
  const windows = rangesToWindows(
    sourceWeek,
    source.map((slot) => ({ start: slot.startsAt, end: slot.endsAt })),
    timeZone,
  )
  let created = 0
  for (const range of windowsToRanges(targetWeek, windows, timeZone)) {
    if (range.end < now + advanceAssignmentMs + minOverlapMs) continue
    if (await insertSlot(db, profile.id, range, timeZone, true)) created += 1
  }
  await db.query(
    `insert into availability_weeks (user_id, week_start, status, copied_from) values ($1, $2::date, 'auto', $3::date) on conflict do nothing`,
    [profile.id, targetWeek, sourceWeek],
  )
  return created
}

/**
 * Gives every repeating person availability for the week the planner is about to target, copied
 * from their most recent week, when they have not set that week themselves.
 */
export async function materializeWeeks(
  db: Db,
  now: number,
): Promise<{ weeks: number; slots: number }> {
  const profiles = await db.query<RepeatingProfile>(
    'select id, city_timezone from profiles where onboarding_completed_at is not null and is_repeating_availability and city_timezone is not null',
  )
  const summary = { weeks: 0, slots: 0 }
  for (const profile of profiles) {
    const targetDate = addLocalDays(localDateOf(profile.city_timezone, now), 2)
    const targetWeek = weekStartOf(
      profile.city_timezone,
      zonedTime(profile.city_timezone, targetDate, 12),
    )
    if (await weekRow(db, profile.id, targetWeek)) continue
    const sourceWeek = await latestWeekBefore(db, profile.id, targetWeek)
    if (!sourceWeek) continue
    summary.slots += await carryForward(db, profile, targetWeek, sourceWeek, now)
    summary.weeks += 1
  }
  return summary
}

export { isReopenable }
