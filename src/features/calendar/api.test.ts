import { beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '@/lib/db'
import { noParams } from '@/lib/http'
import {
  createTestDb,
  createUser,
  jsonRequest,
  stubSessionProvider,
} from '../../../supabase/tests/harness'
import { calendarRoutes } from './api'
import { fakeCalendarProvider } from './fake'
import type { CalendarProvider } from './provider'

let db: Db
const secret = 'test-token-secret-test-token-secret-1234'

beforeAll(async () => {
  db = await createTestDb()
})

function routesFor(
  userId: string | null,
  calendar: CalendarProvider | null = fakeCalendarProvider(),
) {
  return calendarRoutes({
    getProvider: async () => stubSessionProvider(userId),
    getDatabase: async () => db,
    getCalendar: () => calendar,
    tokenSecret: () => secret,
    clock: () => Date.parse('2026-09-28T12:00:00Z'),
  })
}

function get(path: string, cookie?: string): Request {
  return new Request(`http://localhost:3000${path}`, { headers: cookie ? { cookie } : {} })
}

describe('calendar routes', () => {
  it('walks the OAuth round trip with a state cookie and then manages the picker', async () => {
    const userId = await createUser(db)
    const routes = routesFor(userId)
    const before = (await (await routes.status(get('/api/calendar'), noParams)).json()) as {
      isAvailable: boolean
      connection: unknown
    }
    expect(before).toEqual({ isAvailable: true, connection: null, calendars: [] })

    const connect = await routes.connect(get('/api/calendar/google/connect'), noParams)
    expect(connect.status).toBe(302)
    const location = new URL(connect.headers.get('location')!)
    const state = location.searchParams.get('state')!
    const cookie = connect.headers.get('set-cookie')!.split(';')[0]!

    const tampered = await routes.callback(
      get(`/api/calendar/google/callback?code=fake-code&state=wrong`, cookie),
      noParams,
    )
    expect(tampered.headers.get('location')).toBe('/availability?calendar=error')
    const callback = await routes.callback(
      get(`/api/calendar/google/callback?code=fake-code&state=${state}`, cookie),
      noParams,
    )
    expect(callback.headers.get('location')).toBe('/availability?calendar=connected')

    const after = (await (await routes.status(get('/api/calendar'), noParams)).json()) as {
      connection: { accountEmail: string }
      calendars: { id: string; isSelected: boolean }[]
    }
    expect(after.connection.accountEmail).toBe('you@gmail.demo')
    expect(after.calendars.map((c) => c.id)).toEqual(['primary', 'work'])

    const selected = (await (
      await routes.select(
        jsonRequest('POST', '/api/calendar/calendars', { selected: ['primary'] }),
        noParams,
      )
    ).json()) as { calendars: { id: string; isSelected: boolean }[] }
    expect(selected.calendars.map((c) => [c.id, c.isSelected])).toEqual([
      ['primary', true],
      ['work', false],
    ])
    expect((await routes.sync(jsonRequest('POST', '/api/calendar/sync'), noParams)).status).toBe(
      200,
    )
    expect((await routes.disconnect(jsonRequest('DELETE', '/api/calendar'), noParams)).status).toBe(
      204,
    )
    expect(
      (
        (await (await routes.status(get('/api/calendar'), noParams)).json()) as {
          connection: unknown
        }
      ).connection,
    ).toBeNull()
  })

  it('reports unavailability without credentials and requires a session', async () => {
    const userId = await createUser(db)
    const unavailable = routesFor(userId, null)
    expect(
      (
        (await (await unavailable.status(get('/api/calendar'), noParams)).json()) as {
          isAvailable: boolean
        }
      ).isAvailable,
    ).toBe(false)
    expect((await unavailable.connect(get('/api/calendar/google/connect'), noParams)).status).toBe(
      404,
    )
    expect((await routesFor(null).status(get('/api/calendar'), noParams)).status).toBe(401)
    expect(
      (
        await routesFor(userId).select(
          jsonRequest('POST', '/api/calendar/calendars', { selected: ['x'] }),
          noParams,
        )
      ).status,
    ).toBe(409)
  })
})
