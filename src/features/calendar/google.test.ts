import { describe, expect, it, vi } from 'vitest'
import { zonedTime } from '@/lib/time'
import { googleCalendarProvider, googleScopes } from './google'

const config = { clientId: 'id', clientSecret: 'secret' }

function fetchSequence(responses: { status: number; body?: unknown }[]) {
  const queue = [...responses]
  const calls: { url: string; init: RequestInit }[] = []
  const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    const next = queue.shift() ?? { status: 500 }
    return new Response(next.body === undefined ? null : JSON.stringify(next.body), {
      status: next.status,
      headers: { 'content-type': 'application/json' },
    })
  })
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls }
}

const idToken = `x.${Buffer.from(JSON.stringify({ email: 'me@gmail.com' })).toString('base64url')}.y`

describe('googleCalendarProvider', () => {
  it('builds an offline-access authorization url with the calendar scope', () => {
    const url = new URL(
      googleCalendarProvider(config).authorizationUrl('http://localhost:3000/cb', 'st'),
    )
    expect(url.searchParams.get('access_type')).toBe('offline')
    expect(url.searchParams.get('prompt')).toBe('consent')
    expect(url.searchParams.get('scope')).toBe(googleScopes.join(' '))
    expect(url.searchParams.get('state')).toBe('st')
  })

  it('exchanges a code for tokens and reads the email from the id token', async () => {
    const { fetchImpl, calls } = fetchSequence([
      {
        status: 200,
        body: { access_token: 'at', refresh_token: 'rt', expires_in: 3600, id_token: idToken },
      },
    ])
    const tokens = await googleCalendarProvider(config, fetchImpl).exchangeCode(
      'code',
      'http://localhost:3000/cb',
    )
    expect(tokens).toMatchObject({ refreshToken: 'rt', accessToken: 'at', email: 'me@gmail.com' })
    expect(String(calls[0]!.init.body)).toContain('grant_type=authorization_code')
    const missing = fetchSequence([{ status: 200, body: { access_token: 'at', expires_in: 3600 } }])
    await expect(
      googleCalendarProvider(config, missing.fetchImpl).exchangeCode('code', 'cb'),
    ).rejects.toThrow(/refresh token/)
  })

  it('maps calendars and busy events, skipping free and cancelled ones and resolving all-day dates', async () => {
    const tz = 'America/Toronto'
    const { fetchImpl } = fetchSequence([
      {
        status: 200,
        body: {
          items: [
            { id: 'primary', summary: 'Me', primary: true, backgroundColor: '#fff' },
            { id: 'work' },
          ],
        },
      },
      {
        status: 200,
        body: {
          items: [
            {
              id: 'e1',
              summary: 'Dentist',
              start: { dateTime: '2026-10-03T14:00:00Z' },
              end: { dateTime: '2026-10-03T15:00:00Z' },
            },
            {
              id: 'e2',
              summary: 'Free time',
              transparency: 'transparent',
              start: { dateTime: '2026-10-03T16:00:00Z' },
              end: { dateTime: '2026-10-03T17:00:00Z' },
            },
            {
              id: 'e3',
              summary: 'Gone',
              status: 'cancelled',
              start: { dateTime: '2026-10-03T16:00:00Z' },
              end: { dateTime: '2026-10-03T17:00:00Z' },
            },
            {
              id: 'e4',
              summary: 'Vacation',
              start: { date: '2026-10-05' },
              end: { date: '2026-10-06' },
            },
          ],
        },
      },
    ])
    const provider = googleCalendarProvider(config, fetchImpl)
    expect(await provider.listCalendars('at')).toEqual([
      { id: 'primary', summary: 'Me', isPrimary: true, color: '#fff' },
      { id: 'work', summary: 'work', isPrimary: false, color: null },
    ])
    const busy = await provider.listBusy('at', ['primary'], { from: 0, to: 1 }, tz)
    expect(busy.map((b) => b.externalId)).toEqual(['e1', 'e4'])
    expect(busy[1]).toMatchObject({
      isAllDay: true,
      startsAt: zonedTime(tz, '2026-10-05'),
      endsAt: zonedTime(tz, '2026-10-06'),
    })
  })

  it('reuses an existing Convene calendar, creates one when gone, and tolerates deleting a missing event', async () => {
    const { fetchImpl, calls } = fetchSequence([
      { status: 200, body: { id: 'cal-1' } },
      { status: 404 },
      { status: 200, body: { id: 'cal-2' } },
      { status: 200, body: { id: 'evt-1' } },
      { status: 410 },
      { status: 403 },
    ])
    const provider = googleCalendarProvider(config, fetchImpl)
    expect(await provider.ensureConveneCalendar('at', 'America/Toronto', 'cal-1')).toBe('cal-1')
    expect(await provider.ensureConveneCalendar('at', 'America/Toronto', 'cal-1')).toBe('cal-2')
    expect(JSON.parse(String(calls[2]!.init.body))).toMatchObject({ summary: 'Convene' })
    const id = await provider.createEvent('at', 'cal-2', {
      summary: 'Coffee',
      description: 'd',
      location: 'l',
      startsAt: 0,
      endsAt: 3600_000,
      timeZone: 'America/Toronto',
    })
    expect(id).toBe('evt-1')
    await expect(provider.deleteEvent('at', 'cal-2', 'evt-1')).resolves.toBeUndefined()
    await expect(provider.deleteEvent('at', 'cal-2', 'evt-1')).rejects.toMatchObject({
      status: 403,
    })
  })
})
