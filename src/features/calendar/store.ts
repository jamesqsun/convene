import { randomBytes } from 'node:crypto'
import type { Db } from '@/lib/db'
import { decryptSecret, encryptSecret } from '@/lib/secrets'
import type { BusyBlock, CalendarInfo, CalendarProvider, OAuthTokens } from './provider'

/** Persistence for calendar connections, the calendar picker, and cached busy time. */

export interface Connection {
  userId: string
  provider: 'google' | 'fake'
  accountEmail: string
  conveneCalendarId: string | null
  lastSyncedAt: number | null
  lastError: string | null
}

interface ConnectionRow {
  user_id: string
  provider: 'google' | 'fake'
  account_email: string
  convene_calendar_id: string | null
  last_synced_at: Date | null
  last_error: string | null
}

const connectionColumns =
  'user_id, provider, account_email, convene_calendar_id, last_synced_at, last_error'

function toConnection(row: ConnectionRow): Connection {
  return {
    userId: row.user_id,
    provider: row.provider,
    accountEmail: row.account_email,
    conveneCalendarId: row.convene_calendar_id,
    lastSyncedAt: row.last_synced_at?.getTime() ?? null,
    lastError: row.last_error,
  }
}

const globalState = globalThis as unknown as { __conveneDemoTokenSecret?: string }

/** Demo mode has no configured secret; fake tokens are still encrypted with a per-process one. */
export function demoTokenSecret(): string {
  globalState.__conveneDemoTokenSecret ??= randomBytes(32).toString('hex')
  return globalState.__conveneDemoTokenSecret
}

export async function loadConnection(db: Db, userId: string): Promise<Connection | null> {
  const rows = await db.query<ConnectionRow>(
    `select ${connectionColumns} from calendar_connections where user_id = $1`,
    [userId],
  )
  return rows[0] ? toConnection(rows[0]) : null
}

export async function listConnections(db: Db, userIds?: readonly string[]): Promise<Connection[]> {
  const rows = userIds
    ? await db.query<ConnectionRow>(
        `select ${connectionColumns} from calendar_connections where user_id = any($1::uuid[])`,
        [[...userIds]],
      )
    : await db.query<ConnectionRow>(
        `select ${connectionColumns} from calendar_connections order by last_synced_at nulls first`,
      )
  return rows.map(toConnection)
}

export async function saveConnection(
  db: Db,
  userId: string,
  provider: CalendarProvider['kind'],
  tokens: OAuthTokens,
  tokenSecret: string,
): Promise<void> {
  await db.query(
    `insert into calendar_connections (user_id, provider, account_email, refresh_token_encrypted, access_token_encrypted, access_token_expires_at, last_error)
     values ($1, $2, $3, $4, $5, $6::timestamptz, null)
     on conflict (user_id) do update set provider = excluded.provider, account_email = excluded.account_email,
       refresh_token_encrypted = excluded.refresh_token_encrypted, access_token_encrypted = excluded.access_token_encrypted,
       access_token_expires_at = excluded.access_token_expires_at, last_error = null`,
    [
      userId,
      provider,
      tokens.email,
      encryptSecret(tokens.refreshToken, tokenSecret),
      encryptSecret(tokens.accessToken, tokenSecret),
      new Date(tokens.expiresAt).toISOString(),
    ],
  )
}

export async function deleteConnection(db: Db, userId: string): Promise<boolean> {
  const rows = await db.query(
    'delete from calendar_connections where user_id = $1 returning user_id',
    [userId],
  )
  await db.query('delete from calendar_sources where user_id = $1', [userId])
  await db.query('delete from busy_blocks where user_id = $1', [userId])
  return rows.length > 0
}

export async function recordSync(
  db: Db,
  userId: string,
  now: number,
  error: string | null,
  conveneCalendarId?: string,
): Promise<void> {
  await db.query(
    `update calendar_connections set last_synced_at = case when $3::text is null then $2::timestamptz else last_synced_at end,
       last_error = $3, convene_calendar_id = coalesce($4, convene_calendar_id) where user_id = $1`,
    [userId, new Date(now).toISOString(), error, conveneCalendarId ?? null],
  )
}

const refreshLeewayMs = 60_000

/** A usable access token, refreshing and re-encrypting when the cached one is about to expire. */
export async function accessTokenFor(
  db: Db,
  provider: CalendarProvider,
  userId: string,
  tokenSecret: string,
  now: number,
): Promise<string> {
  const rows = await db.query<{
    refresh_token_encrypted: string
    access_token_encrypted: string | null
    access_token_expires_at: Date | null
  }>(
    'select refresh_token_encrypted, access_token_encrypted, access_token_expires_at from calendar_connections where user_id = $1',
    [userId],
  )
  const row = rows[0]
  if (!row) throw new Error('No calendar connection')
  const expiresAt = row.access_token_expires_at?.getTime() ?? 0
  if (row.access_token_encrypted && expiresAt > now + refreshLeewayMs)
    return decryptSecret(row.access_token_encrypted, tokenSecret)
  const refreshed = await provider.refreshAccessToken(
    decryptSecret(row.refresh_token_encrypted, tokenSecret),
  )
  await db.query(
    'update calendar_connections set access_token_encrypted = $2, access_token_expires_at = $3::timestamptz where user_id = $1',
    [
      userId,
      encryptSecret(refreshed.accessToken, tokenSecret),
      new Date(refreshed.expiresAt).toISOString(),
    ],
  )
  return refreshed.accessToken
}

export interface Source extends CalendarInfo {
  isSelected: boolean
}

/** Upserts the person's calendars; new ones start selected, existing selections are kept. */
export async function replaceSources(
  db: Db,
  userId: string,
  calendars: readonly CalendarInfo[],
  excludeId: string | null,
): Promise<void> {
  const kept = calendars.filter((calendar) => calendar.id !== excludeId)
  await db.transaction(async (tx) => {
    await tx.query(
      'delete from calendar_sources where user_id = $1 and not (calendar_id = any($2::text[]))',
      [userId, kept.map((c) => c.id)],
    )
    for (const calendar of kept) {
      await tx.query(
        `insert into calendar_sources (user_id, calendar_id, summary, is_primary, color)
         values ($1, $2, $3, $4, $5)
         on conflict (user_id, calendar_id) do update set summary = excluded.summary, is_primary = excluded.is_primary, color = excluded.color`,
        [userId, calendar.id, calendar.summary, calendar.isPrimary, calendar.color],
      )
    }
  })
}

export async function listSources(db: Db, userId: string): Promise<Source[]> {
  const rows = await db.query<{
    calendar_id: string
    summary: string
    is_primary: boolean
    is_selected: boolean
    color: string | null
  }>(
    'select calendar_id, summary, is_primary, is_selected, color from calendar_sources where user_id = $1 order by is_primary desc, summary',
    [userId],
  )
  return rows.map((row) => ({
    id: row.calendar_id,
    summary: row.summary,
    isPrimary: row.is_primary,
    isSelected: row.is_selected,
    color: row.color,
  }))
}

export async function setSelectedSources(
  db: Db,
  userId: string,
  selectedIds: readonly string[],
): Promise<void> {
  await db.query(
    'update calendar_sources set is_selected = (calendar_id = any($2::text[])) where user_id = $1',
    [userId, [...selectedIds]],
  )
}

export async function replaceBusyBlocks(
  db: Db,
  userId: string,
  blocks: readonly BusyBlock[],
  range: { from: number; to: number },
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.query(
      'delete from busy_blocks where user_id = $1 and ends_at > $2::timestamptz and starts_at < $3::timestamptz',
      [userId, new Date(range.from).toISOString(), new Date(range.to).toISOString()],
    )
    for (const block of blocks) {
      await tx.query(
        `insert into busy_blocks (user_id, calendar_id, external_id, summary, starts_at, ends_at, is_all_day)
         values ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz, $7)
         on conflict (user_id, calendar_id, external_id) do update set summary = excluded.summary, starts_at = excluded.starts_at, ends_at = excluded.ends_at, is_all_day = excluded.is_all_day`,
        [
          userId,
          block.calendarId,
          block.externalId,
          block.summary,
          new Date(block.startsAt).toISOString(),
          new Date(block.endsAt).toISOString(),
          block.isAllDay,
        ],
      )
    }
  })
}

export interface BusyInterval {
  startsAt: number
  endsAt: number
  summary: string
  calendarId: string
  isAllDay: boolean
}

/** Cached busy time for several people over a range, keyed by user id. */
export async function listBusyBlocks(
  db: Db,
  userIds: readonly string[],
  range: { from: number; to: number },
): Promise<Map<string, BusyInterval[]>> {
  const byUser = new Map<string, BusyInterval[]>()
  if (userIds.length === 0) return byUser
  const rows = await db.query<{
    user_id: string
    calendar_id: string
    summary: string
    starts_at: Date
    ends_at: Date
    is_all_day: boolean
  }>(
    `select b.user_id, b.calendar_id, b.summary, b.starts_at, b.ends_at, b.is_all_day from busy_blocks b
     join calendar_sources s on s.user_id = b.user_id and s.calendar_id = b.calendar_id and s.is_selected
     where b.user_id = any($1::uuid[]) and b.ends_at > $2::timestamptz and b.starts_at < $3::timestamptz
     order by b.starts_at`,
    [[...userIds], new Date(range.from).toISOString(), new Date(range.to).toISOString()],
  )
  for (const row of rows) {
    const list = byUser.get(row.user_id) ?? []
    list.push({
      startsAt: row.starts_at.getTime(),
      endsAt: row.ends_at.getTime(),
      summary: row.summary,
      calendarId: row.calendar_id,
      isAllDay: row.is_all_day,
    })
    byUser.set(row.user_id, list)
  }
  return byUser
}
