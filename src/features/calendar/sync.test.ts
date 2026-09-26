import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Db } from '@/lib/db'
import { zonedTime } from '@/lib/time'
import { bookGroup, count, createTestDb, createUser } from '../../../supabase/tests/harness'
import { fakeCalendarProvider } from './fake'
import { listBusyBlocks, listSources, loadConnection, saveConnection } from './store'
import { findLiveConflict, syncEventEntries, syncStaleCalendars, syncUserCalendar } from './sync'

let db: Db
const secret = 'test-token-secret-test-token-secret-1234'
const now = zonedTime('America/Toronto', '2026-09-28', 8)
const tokens = {
  refreshToken: 'rt',
  accessToken: 'at',
  expiresAt: now + 3_600_000,
  email: 'you@gmail.demo',
}

beforeAll(async () => {
  db = await createTestDb()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

describe('calendar sync', () => {
  it('syncs calendars, the Convene calendar id, and busy time for a connected person', async () => {
    const userId = await createUser(db)
    await saveConnection(db, userId, 'fake', tokens, secret)
    const deps = { db, provider: fakeCalendarProvider(), tokenSecret: secret }
    const result = await syncUserCalendar(deps, userId, now)
    expect(result.busyBlocks).toBeGreaterThan(10)
    expect((await loadConnection(db, userId))!).toMatchObject({
      conveneCalendarId: 'convene-demo',
      lastError: null,
    })
    expect((await listSources(db, userId)).map((s) => s.id)).toEqual(['primary', 'work'])
    const busy = await listBusyBlocks(db, [userId], { from: now, to: now + 7 * 86_400_000 })
    expect(busy.get(userId)!.some((b) => b.summary === 'Work')).toBe(true)
    expect(await syncStaleCalendars(deps, now + 60_000)).toEqual({ synced: 0, failed: 0 })
    expect(await syncStaleCalendars(deps, now + 31 * 60_000)).toEqual({ synced: 1, failed: 0 })
  })

  it('records errors without throwing them past the tick', async () => {
    const userId = await createUser(db)
    await saveConnection(db, userId, 'fake', tokens, secret)
    const broken = {
      ...fakeCalendarProvider(),
      listCalendars: async () => {
        throw new Error('quota')
      },
    }
    await expect(
      syncUserCalendar({ db, provider: broken, tokenSecret: secret }, userId, now),
    ).rejects.toThrow('quota')
    expect((await loadConnection(db, userId))!.lastError).toBe('quota')
    expect(
      await syncStaleCalendars({ db, provider: broken, tokenSecret: secret }, now + 31 * 60_000),
    ).toMatchObject({ failed: 1 })
  })

  it('finds a live conflict only for connected people with a selected busy calendar', async () => {
    const userId = await createUser(db)
    const deps = { db, provider: fakeCalendarProvider(), tokenSecret: secret }
    const workHours = {
      from: zonedTime('America/Toronto', '2026-09-30', 10),
      to: zonedTime('America/Toronto', '2026-09-30', 11),
    }
    expect(await findLiveConflict(deps, userId, workHours, now)).toBeNull()
    await saveConnection(db, userId, 'fake', tokens, secret)
    await syncUserCalendar(deps, userId, now)
    expect((await findLiveConflict(deps, userId, workHours, now))?.summary).toBe('Work')
    const evening = {
      from: zonedTime('America/Toronto', '2026-09-29', 19),
      to: zonedTime('America/Toronto', '2026-09-29', 20),
    }
    expect(await findLiveConflict(deps, userId, evening, now)).toBeNull()
  })

  it('writes upcoming hangouts to the Convene calendar and removes them after withdrawal', async () => {
    const connected = await createUser(db)
    const other = await createUser(db)
    const provider = fakeCalendarProvider()
    const deps = { db, provider, tokenSecret: secret }
    await saveConnection(db, connected, 'fake', tokens, secret)
    await syncUserCalendar(deps, connected, now)
    const { eventId } = await bookGroup(db, {
      localDate: '2026-10-03',
      startIso: '2026-10-03T22:00:00Z',
      endIso: '2026-10-03T23:00:00Z',
      nowIso: new Date(now).toISOString(),
      users: [connected, other],
    })
    expect(await syncEventEntries(deps, now)).toEqual({ created: 1, removed: 0 })
    expect(provider.writtenEvents[0]!.event.summary).toBe('Convene: Coffee')
    expect(provider.writtenEvents[0]!.event.description).not.toContain('+1416')
    expect(await count(db, 'event_calendar_entries', "status = 'created'")).toBe(1)
    expect(await syncEventEntries(deps, now)).toEqual({ created: 0, removed: 0 })
    await db.query('select withdraw_participant($1, $2, $3::timestamptz)', [
      eventId,
      connected,
      new Date(now).toISOString(),
    ])
    expect(await syncEventEntries(deps, now)).toEqual({ created: 0, removed: 1 })
    expect(provider.deletedEvents).toHaveLength(1)
    expect(await count(db, 'event_calendar_entries', "status = 'cancelled'")).toBe(1)
  })
})
