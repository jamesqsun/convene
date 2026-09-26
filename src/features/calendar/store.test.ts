import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Db } from '@/lib/db'
import { createTestDb, createUser } from '../../../supabase/tests/harness'
import { fakeCalendarProvider } from './fake'
import {
  accessTokenFor,
  deleteConnection,
  listBusyBlocks,
  listSources,
  loadConnection,
  replaceBusyBlocks,
  replaceSources,
  saveConnection,
  setSelectedSources,
} from './store'

let db: Db
const secret = 'test-token-secret-test-token-secret-1234'
const tokens = {
  refreshToken: 'rt',
  accessToken: 'at',
  expiresAt: Date.parse('2026-10-01T13:00:00Z'),
  email: 'me@gmail.com',
}

beforeAll(async () => {
  db = await createTestDb()
})

describe('calendar store', () => {
  it('stores encrypted tokens, refreshes when expiring, and deletes everything on disconnect', async () => {
    const userId = await createUser(db)
    await saveConnection(db, userId, 'google', tokens, secret)
    expect(await loadConnection(db, userId)).toMatchObject({
      userId,
      provider: 'google',
      accountEmail: 'me@gmail.com',
      conveneCalendarId: null,
    })
    const raw = await db.query<{ refresh_token_encrypted: string }>(
      'select refresh_token_encrypted from calendar_connections where user_id = $1',
      [userId],
    )
    expect(raw[0]!.refresh_token_encrypted).not.toContain('rt')

    const provider = fakeCalendarProvider()
    const refresh = vi.spyOn(provider, 'refreshAccessToken')
    expect(
      await accessTokenFor(db, provider, userId, secret, Date.parse('2026-10-01T12:00:00Z')),
    ).toBe('at')
    expect(refresh).not.toHaveBeenCalled()
    expect(
      await accessTokenFor(db, provider, userId, secret, Date.parse('2026-10-01T12:59:30Z')),
    ).toBe('fake-access')
    expect(refresh).toHaveBeenCalledTimes(1)

    await replaceSources(db, userId, await provider.listCalendars('x'), null)
    expect(await deleteConnection(db, userId)).toBe(true)
    expect(await loadConnection(db, userId)).toBeNull()
    expect(await listSources(db, userId)).toEqual([])
  })

  it('keeps calendar selections across refreshes and hides the Convene calendar', async () => {
    const userId = await createUser(db)
    await replaceSources(
      db,
      userId,
      [
        { id: 'primary', summary: 'Me', isPrimary: true, color: null },
        { id: 'work', summary: 'Work', isPrimary: false, color: '#f00' },
        { id: 'convene-x', summary: 'Convene', isPrimary: false, color: null },
      ],
      'convene-x',
    )
    expect((await listSources(db, userId)).map((s) => [s.id, s.isSelected])).toEqual([
      ['primary', true],
      ['work', true],
    ])
    await setSelectedSources(db, userId, ['primary'])
    await replaceSources(
      db,
      userId,
      [
        { id: 'primary', summary: 'Me!', isPrimary: true, color: null },
        { id: 'work', summary: 'Work', isPrimary: false, color: null },
        { id: 'new', summary: 'New', isPrimary: false, color: null },
      ],
      null,
    )
    expect((await listSources(db, userId)).map((s) => [s.id, s.summary, s.isSelected])).toEqual([
      ['primary', 'Me!', true],
      ['new', 'New', true],
      ['work', 'Work', false],
    ])
  })

  it('replaces cached busy blocks per range and returns only selected calendars', async () => {
    const userId = await createUser(db)
    await replaceSources(
      db,
      userId,
      [
        { id: 'primary', summary: 'Me', isPrimary: true, color: null },
        { id: 'work', summary: 'Work', isPrimary: false, color: null },
      ],
      null,
    )
    const range = {
      from: Date.parse('2026-10-01T00:00:00Z'),
      to: Date.parse('2026-10-08T00:00:00Z'),
    }
    await replaceBusyBlocks(
      db,
      userId,
      [
        {
          calendarId: 'primary',
          externalId: 'a',
          summary: 'Dentist',
          startsAt: Date.parse('2026-10-03T14:00:00Z'),
          endsAt: Date.parse('2026-10-03T15:00:00Z'),
          isAllDay: false,
        },
        {
          calendarId: 'work',
          externalId: 'b',
          summary: 'Standup',
          startsAt: Date.parse('2026-10-03T13:00:00Z'),
          endsAt: Date.parse('2026-10-03T13:30:00Z'),
          isAllDay: false,
        },
      ],
      range,
    )
    await setSelectedSources(db, userId, ['primary'])
    const busy = await listBusyBlocks(db, [userId], range)
    expect(busy.get(userId)!.map((b) => b.summary)).toEqual(['Dentist'])
    await replaceBusyBlocks(db, userId, [], range)
    expect((await listBusyBlocks(db, [userId], range)).size).toBe(0)
    expect((await listBusyBlocks(db, [], range)).size).toBe(0)
  })
})
