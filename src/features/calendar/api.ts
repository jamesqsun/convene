import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import {
  type SessionProvider,
  authed,
  authedMutation,
  sessionProvider,
} from '@/features/auth/session'
import { cookieJarFor } from '@/lib/cookies'
import { type Db, getDb } from '@/lib/db'
import { HttpError, type RouteHandler, jsonResponse, readJson } from '@/lib/http'
import { getProviders } from '@/lib/providers'
import type { CalendarProvider } from './provider'
import { configuredTokenSecret } from './config'
import {
  deleteConnection,
  listSources,
  loadConnection,
  saveConnection,
  setSelectedSources,
} from './store'
import { syncUserCalendar } from './sync'

/**
 * Calendar routes: connection status and picker, the Google OAuth round trip, manual sync, and
 * disconnect. The OAuth state lives in a short-lived cookie and must match on callback.
 */

export interface CalendarRouteDeps {
  getProvider: () => Promise<SessionProvider>
  getDatabase: () => Promise<Db>
  getCalendar: () => CalendarProvider | null
  tokenSecret: () => string
  clock: () => number
}

const stateCookie = 'convene_oauth_state'
const selectionSchema = z
  .object({ selected: z.array(z.string().min(1).max(512)).max(100) })
  .strict()

function redirectResponse(location: string): Response {
  return new Response(null, { status: 302, headers: { location } })
}

function callbackUri(request: Request): string {
  const url = new URL(request.url)
  return `${url.origin}/api/calendar/google/callback`
}

function requireCalendar(deps: CalendarRouteDeps): CalendarProvider {
  const provider = deps.getCalendar()
  if (!provider)
    throw new HttpError(
      404,
      'calendar_unavailable',
      'Calendar sync is not configured on this server',
    )
  return provider
}

async function statusResponse(db: Db, userId: string, isAvailable: boolean): Promise<Response> {
  const connection = await loadConnection(db, userId)
  return jsonResponse({
    isAvailable,
    connection: connection
      ? {
          accountEmail: connection.accountEmail,
          lastSyncedAt: connection.lastSyncedAt,
          lastError: connection.lastError,
        }
      : null,
    calendars: connection ? await listSources(db, userId) : [],
  })
}

export function calendarRoutes(deps: CalendarRouteDeps) {
  const syncDeps = async () => ({
    db: await deps.getDatabase(),
    provider: requireCalendar(deps),
    tokenSecret: deps.tokenSecret(),
  })
  return {
    status: authed(
      async (_request, userId) =>
        statusResponse(await deps.getDatabase(), userId, deps.getCalendar() !== null),
      deps.getProvider,
    ),
    connect: authed(async (request) => {
      const provider = requireCalendar(deps)
      const state = randomBytes(16).toString('base64url')
      const jar = cookieJarFor(request)
      jar.setAll([
        {
          name: stateCookie,
          value: state,
          options: { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 600 },
        },
      ])
      return jar.applyTo(redirectResponse(provider.authorizationUrl(callbackUri(request), state)))
    }, deps.getProvider),
    callback: authed(async (request, userId) => {
      const provider = requireCalendar(deps)
      const url = new URL(request.url)
      const jar = cookieJarFor(request)
      const expected = jar.getAll().find((cookie) => cookie.name === stateCookie)?.value
      jar.setAll([
        {
          name: stateCookie,
          value: '',
          options: { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 },
        },
      ])
      const code = url.searchParams.get('code')
      if (!code || !expected || url.searchParams.get('state') !== expected) {
        return jar.applyTo(redirectResponse('/availability?calendar=error'))
      }
      try {
        const tokens = await provider.exchangeCode(code, callbackUri(request))
        const db = await deps.getDatabase()
        await saveConnection(db, userId, provider.kind, tokens, deps.tokenSecret())
        await syncUserCalendar(
          { db, provider, tokenSecret: deps.tokenSecret() },
          userId,
          deps.clock(),
        )
        return jar.applyTo(redirectResponse('/availability?calendar=connected'))
      } catch (error) {
        console.error('[calendar] connect failed:', error)
        return jar.applyTo(redirectResponse('/availability?calendar=error'))
      }
    }, deps.getProvider),
    select: authedMutation(async (request, userId) => {
      const body = await readJson(request, selectionSchema)
      const sync = await syncDeps()
      if (!(await loadConnection(sync.db, userId)))
        throw new HttpError(409, 'not_connected', 'Connect a calendar first')
      await setSelectedSources(sync.db, userId, body.selected)
      await syncUserCalendar(sync, userId, deps.clock()).catch(() => undefined)
      return statusResponse(sync.db, userId, true)
    }, deps.getProvider),
    sync: authedMutation(async (_request, userId) => {
      const sync = await syncDeps()
      if (!(await loadConnection(sync.db, userId)))
        throw new HttpError(409, 'not_connected', 'Connect a calendar first')
      await syncUserCalendar(sync, userId, deps.clock()).catch(() => undefined)
      return statusResponse(sync.db, userId, true)
    }, deps.getProvider),
    disconnect: authedMutation(async (_request, userId) => {
      await deleteConnection(await deps.getDatabase(), userId)
      return new Response(null, { status: 204 })
    }, deps.getProvider),
  }
}

const routes = calendarRoutes({
  getProvider: sessionProvider,
  getDatabase: getDb,
  getCalendar: () => getProviders().calendar,
  tokenSecret: configuredTokenSecret,
  clock: Date.now,
})
export const GET_status: RouteHandler = routes.status
export const GET_connect: RouteHandler = routes.connect
export const GET_callback: RouteHandler = routes.callback
export const POST_select: RouteHandler = routes.select
export const POST_sync: RouteHandler = routes.sync
export const DELETE_disconnect: RouteHandler = routes.disconnect
