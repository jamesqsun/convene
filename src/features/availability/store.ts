import type { Db } from '@/lib/db'
import { HttpError } from '@/lib/http'
import { addLocalDays, advanceAssignmentMs, hour, zonedTime } from '@/lib/time'
import { minOverlapMs } from '@/features/planning/types'
import type { SlotInput } from './schemas'
import type { SlotStatus } from './slot-state'

export interface Slot {
  id: string
  startsAt: number
  endsAt: number
  timezone: string
  status: SlotStatus
  revision: number
  assignedEventId: string | null
}

interface SlotRow {
  id: string
  starts_at: Date
  ends_at: Date
  timezone: string
  status: SlotStatus
  revision: number
  assigned_event_id: string | null
}

const columns = 'id, starts_at, ends_at, timezone, status, revision, assigned_event_id'
export const maxSlotMs = 16 * hour

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

/** Interprets clock times in the owner's zone; an end at or before the start means the next day. */
export function windowFor(
  input: SlotInput,
  timezone: string,
  now: number,
): { start: number; end: number } {
  const [sh, sm] = input.startTime.split(':').map(Number)
  const [eh, em] = input.endTime.split(':').map(Number)
  const start = zonedTime(timezone, input.date, sh, sm)
  let end = zonedTime(timezone, input.date, eh, em)
  if (end <= start) end = zonedTime(timezone, addLocalDays(input.date, 1), eh, em)
  if (end - start < minOverlapMs)
    throw new HttpError(400, 'too_short', 'Availability must be at least one hour')
  if (end - start > maxSlotMs)
    throw new HttpError(400, 'too_long', 'Availability can be at most sixteen hours')
  if (end < now + advanceAssignmentMs + minOverlapMs) {
    throw new HttpError(
      422,
      'too_soon',
      'Plans are made at least 48 hours ahead; pick a window that ends later than that',
    )
  }
  return { start, end }
}

export function isReopenable(slot: Pick<Slot, 'endsAt'>, now: number): boolean {
  return slot.endsAt - minOverlapMs >= now + advanceAssignmentMs
}

/** The owner's slots that have not ended yet; past availability has no actions and no plan link. */
export async function listSlots(db: Db, userId: string, now: number): Promise<Slot[]> {
  const rows = await db.query<SlotRow>(
    `select ${columns} from availability_slots where user_id = $1 and ends_at > $2::timestamptz order by starts_at`,
    [userId, new Date(now).toISOString()],
  )
  return rows.map(toSlot)
}

function isOverlap(error: unknown): boolean {
  return error instanceof Error && /exclusion constraint/.test(error.message)
}

export async function createSlot(
  db: Db,
  userId: string,
  window: { start: number; end: number },
  timezone: string,
): Promise<Slot> {
  try {
    const rows = await db.query<SlotRow>(
      `insert into availability_slots (user_id, "window", timezone)
       values ($1, tstzrange($2::timestamptz, $3::timestamptz, '[)'), $4) returning ${columns}`,
      [userId, new Date(window.start).toISOString(), new Date(window.end).toISOString(), timezone],
    )
    return toSlot(rows[0]!)
  } catch (error) {
    if (isOverlap(error))
      throw new HttpError(409, 'overlap', 'This overlaps availability you already saved')
    throw error
  }
}

async function requireOwnedSlot(db: Db, userId: string, slotId: string): Promise<Slot> {
  const rows = await db.query<SlotRow>(
    `select ${columns} from availability_slots where id = $1 and user_id = $2`,
    [slotId, userId],
  )
  if (!rows[0]) throw new HttpError(404, 'slot_missing', 'Availability not found')
  return toSlot(rows[0])
}

/** Edits are only possible before assignment; each edit bumps the revision so stale plans fail. */
export async function updateSlot(
  db: Db,
  userId: string,
  slotId: string,
  window: { start: number; end: number },
): Promise<Slot> {
  const slot = await requireOwnedSlot(db, userId, slotId)
  if (slot.status !== 'pending' && slot.status !== 'paused')
    throw new HttpError(409, 'slot_locked', 'This availability can no longer be edited')
  try {
    const rows = await db.query<SlotRow>(
      `update availability_slots set "window" = tstzrange($3::timestamptz, $4::timestamptz, '[)'), revision = revision + 1
       where id = $1 and user_id = $2 returning ${columns}`,
      [slotId, userId, new Date(window.start).toISOString(), new Date(window.end).toISOString()],
    )
    return toSlot(rows[0]!)
  } catch (error) {
    if (isOverlap(error))
      throw new HttpError(409, 'overlap', 'This overlaps availability you already saved')
    throw error
  }
}

export async function transitionSlot(
  db: Db,
  userId: string,
  slotId: string,
  from: readonly SlotStatus[],
  to: SlotStatus,
): Promise<Slot> {
  const slot = await requireOwnedSlot(db, userId, slotId)
  if (!from.includes(slot.status))
    throw new HttpError(
      409,
      'slot_locked',
      `Availability is ${slot.status} and cannot become ${to}`,
    )
  const rows = await db.query<SlotRow>(
    `update availability_slots set status = $3, revision = revision + 1 where id = $1 and user_id = $2 returning ${columns}`,
    [slotId, userId, to],
  )
  return toSlot(rows[0]!)
}

export async function reopenSlot(
  db: Db,
  userId: string,
  slotId: string,
  now: number,
): Promise<Slot> {
  const slot = await requireOwnedSlot(db, userId, slotId)
  if (!isReopenable(slot, now))
    throw new HttpError(409, 'too_soon', 'This window can no longer be planned 48 hours ahead')
  return transitionSlot(db, userId, slotId, ['paused'], 'pending')
}
