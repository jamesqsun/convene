import { z } from 'zod'
import { zonedTime } from '@/lib/time'
import {
  type BusyBlock,
  type CalendarEventInput,
  type CalendarInfo,
  type CalendarProvider,
  CalendarApiError,
  conveneCalendarName,
} from './provider'

/**
 * Google Calendar over plain fetch. Scope `calendar` is needed because the Convene calendar is
 * created in the person's account; `openid email` identifies the connected account.
 */

export const googleScopes = ['openid', 'email', 'https://www.googleapis.com/auth/calendar']
const authEndpoint = 'https://accounts.google.com/o/oauth2/v2/auth'
const tokenEndpoint = 'https://oauth2.googleapis.com/token'
const userInfoEndpoint = 'https://openidconnect.googleapis.com/v1/userinfo'
const apiBase = 'https://www.googleapis.com/calendar/v3'

const tokenSchema = z.object({
  access_token: z.string(),
  expires_in: z.number(),
  refresh_token: z.string().optional(),
  id_token: z.string().optional(),
})

const calendarListSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        summary: z.string().optional(),
        primary: z.boolean().optional(),
        backgroundColor: z.string().optional(),
      }),
    )
    .optional(),
})

const eventTime = z.object({ dateTime: z.string().optional(), date: z.string().optional() })

const eventsSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        summary: z.string().optional(),
        status: z.string().optional(),
        transparency: z.string().optional(),
        start: eventTime.optional(),
        end: eventTime.optional(),
      }),
    )
    .optional(),
  nextPageToken: z.string().optional(),
})

function emailFromIdToken(idToken: string | undefined): string | null {
  const payload = idToken?.split('.')[1]
  if (!payload) return null
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      email?: string
    }
    return claims.email ?? null
  } catch {
    return null
  }
}

function toBusyBlock(
  calendarId: string,
  item: z.infer<typeof eventsSchema>['items'] extends (infer T)[] | undefined ? T : never,
  timeZone: string,
): BusyBlock | null {
  if (item.status === 'cancelled' || item.transparency === 'transparent') return null
  const summary = item.summary ?? '(busy)'
  if (item.start?.dateTime && item.end?.dateTime) {
    return {
      calendarId,
      externalId: item.id,
      summary,
      startsAt: Date.parse(item.start.dateTime),
      endsAt: Date.parse(item.end.dateTime),
      isAllDay: false,
    }
  }
  if (item.start?.date && item.end?.date) {
    return {
      calendarId,
      externalId: item.id,
      summary,
      startsAt: zonedTime(timeZone, item.start.date),
      endsAt: zonedTime(timeZone, item.end.date),
      isAllDay: true,
    }
  }
  return null
}

export function googleCalendarProvider(
  config: { clientId: string; clientSecret: string },
  fetchImpl: typeof fetch = fetch,
): CalendarProvider {
  async function call<T>(
    accessToken: string,
    method: string,
    url: string,
    schema: z.ZodType<T>,
    body?: unknown,
  ): Promise<T> {
    const response = await fetchImpl(url, {
      method,
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!response.ok)
      throw new CalendarApiError(
        response.status,
        `Google Calendar ${method} ${url} failed with ${response.status}`,
      )
    if (response.status === 204) return schema.parse({})
    return schema.parse(await response.json())
  }

  async function token(params: Record<string, string>): Promise<z.infer<typeof tokenSchema>> {
    const response = await fetchImpl(tokenEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        ...params,
      }).toString(),
    })
    if (!response.ok)
      throw new CalendarApiError(
        response.status,
        `Google token request failed with ${response.status}`,
      )
    return tokenSchema.parse(await response.json())
  }

  return {
    kind: 'google',
    authorizationUrl(redirectUri, state) {
      const query = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: googleScopes.join(' '),
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: 'true',
        state,
      })
      return `${authEndpoint}?${query.toString()}`
    },
    async exchangeCode(code, redirectUri) {
      const granted = await token({
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      })
      if (!granted.refresh_token)
        throw new CalendarApiError(
          400,
          'Google did not return a refresh token; revoke access and reconnect',
        )
      let email = emailFromIdToken(granted.id_token)
      if (!email) {
        const info = await call(
          granted.access_token,
          'GET',
          userInfoEndpoint,
          z.object({ email: z.string() }),
        )
        email = info.email
      }
      return {
        refreshToken: granted.refresh_token,
        accessToken: granted.access_token,
        expiresAt: Date.now() + granted.expires_in * 1000,
        email,
      }
    },
    async refreshAccessToken(refreshToken) {
      const refreshed = await token({ refresh_token: refreshToken, grant_type: 'refresh_token' })
      return {
        accessToken: refreshed.access_token,
        expiresAt: Date.now() + refreshed.expires_in * 1000,
      }
    },
    async listCalendars(accessToken) {
      const list = await call(
        accessToken,
        'GET',
        `${apiBase}/users/me/calendarList?minAccessRole=reader`,
        calendarListSchema,
      )
      return (list.items ?? []).map((item): CalendarInfo => ({
        id: item.id,
        summary: item.summary ?? item.id,
        isPrimary: item.primary ?? false,
        color: item.backgroundColor ?? null,
      }))
    },
    async listBusy(accessToken, calendarIds, range, timeZone) {
      const blocks: BusyBlock[] = []
      for (const calendarId of calendarIds) {
        let pageToken: string | undefined
        do {
          const query = new URLSearchParams({
            singleEvents: 'true',
            orderBy: 'startTime',
            timeMin: new Date(range.from).toISOString(),
            timeMax: new Date(range.to).toISOString(),
            maxResults: '250',
            fields: 'nextPageToken,items(id,summary,status,transparency,start,end)',
          })
          if (pageToken) query.set('pageToken', pageToken)
          const page = await call(
            accessToken,
            'GET',
            `${apiBase}/calendars/${encodeURIComponent(calendarId)}/events?${query.toString()}`,
            eventsSchema,
          )
          for (const item of page.items ?? []) {
            const block = toBusyBlock(calendarId, item, timeZone)
            if (block) blocks.push(block)
          }
          pageToken = page.nextPageToken
        } while (pageToken)
      }
      return blocks
    },
    async ensureConveneCalendar(accessToken, timeZone, existingId) {
      if (existingId) {
        try {
          await call(
            accessToken,
            'GET',
            `${apiBase}/calendars/${encodeURIComponent(existingId)}`,
            z.object({ id: z.string() }),
          )
          return existingId
        } catch (error) {
          if (!(
            error instanceof CalendarApiError &&
            (error.status === 404 || error.status === 410)
          ))
            throw error
        }
      }
      const created = await call(
        accessToken,
        'POST',
        `${apiBase}/calendars`,
        z.object({ id: z.string() }),
        {
          summary: conveneCalendarName,
          description: 'Hangouts planned by Convene.',
          timeZone,
        },
      )
      return created.id
    },
    async createEvent(accessToken, calendarId, event: CalendarEventInput) {
      const created = await call(
        accessToken,
        'POST',
        `${apiBase}/calendars/${encodeURIComponent(calendarId)}/events`,
        z.object({ id: z.string() }),
        {
          summary: event.summary,
          description: event.description,
          location: event.location,
          start: { dateTime: new Date(event.startsAt).toISOString(), timeZone: event.timeZone },
          end: { dateTime: new Date(event.endsAt).toISOString(), timeZone: event.timeZone },
        },
      )
      return created.id
    },
    async deleteEvent(accessToken, calendarId, externalEventId) {
      try {
        await call(
          accessToken,
          'DELETE',
          `${apiBase}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(externalEventId)}`,
          z.object({}),
        )
      } catch (error) {
        if (!(error instanceof CalendarApiError && (error.status === 404 || error.status === 410)))
          throw error
      }
    },
  }
}
