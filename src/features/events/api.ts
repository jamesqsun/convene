import { z } from 'zod'
import {
  type SessionProvider,
  authed,
  authedMutation,
  sessionProvider,
} from '@/features/auth/session'
import { configuredTokenSecret } from '@/features/calendar/config'
import type { CalendarProvider } from '@/features/calendar/provider'
import { syncEventEntries } from '@/features/calendar/sync'
import type { PushSender } from '@/features/push/provider'
import { drainNotificationJobs } from '@/features/push/sender'
import { type Db, getDb } from '@/lib/db'
import { HttpError, type RouteHandler, jsonResponse } from '@/lib/http'
import { getProviders } from '@/lib/providers'
import { loadHangouts, loadPlan } from './read'
import { withdrawFromEvent } from './withdraw'

export interface EventRouteDeps {
  getProvider: () => Promise<SessionProvider>
  getDatabase: () => Promise<Db>
  getPush: () => PushSender
  getCalendar: () => CalendarProvider | null
  tokenSecret: () => string
  clock: () => number
}

const idSchema = z.uuid()

function eventId(params: { eventId?: string }): string {
  const parsed = idSchema.safeParse(params.eventId)
  if (!parsed.success) throw new HttpError(404, 'plan_missing', 'Plan not found')
  return parsed.data
}

export function eventRoutes(deps: EventRouteDeps) {
  return {
    detail: authed<{ eventId: string }>(async (_request, userId, params) => {
      const plan = await loadPlan(await deps.getDatabase(), userId, eventId(params), deps.clock())
      if (!plan) throw new HttpError(404, 'plan_missing', 'Plan not found')
      if (plan.status === 'scheduled' && plan.endsAt <= deps.clock()) {
        const [hangout] = await loadHangouts(
          await deps.getDatabase(),
          userId,
          deps.clock(),
          plan.eventId,
        )
        return jsonResponse({ hangout })
      }
      return jsonResponse({ plan })
    }, deps.getProvider),
    withdraw: authedMutation<{ eventId: string }>(async (_request, userId, params) => {
      const db = await deps.getDatabase()
      const outcome = await withdrawFromEvent(db, userId, eventId(params), deps.clock())
      // Best effort: get cancellation and participant_left pushes out now; the worker catches leftovers.
      await drainNotificationJobs(db, deps.getPush(), deps.clock(), 20).catch((error) =>
        console.warn('[withdraw] drain failed:', error),
      )
      const calendar = deps.getCalendar()
      if (calendar) {
        await syncEventEntries(
          { db, provider: calendar, tokenSecret: deps.tokenSecret() },
          deps.clock(),
        ).catch((error) => console.warn('[withdraw] calendar sync failed:', error))
      }
      return jsonResponse({ result: outcome.result, remaining: outcome.remaining })
    }, deps.getProvider),
  }
}

const routes = eventRoutes({
  getProvider: sessionProvider,
  getDatabase: getDb,
  getPush: () => getProviders().push,
  getCalendar: () => getProviders().calendar,
  tokenSecret: configuredTokenSecret,
  clock: Date.now,
})
export const GET: RouteHandler<{ eventId: string }> = routes.detail
export const POST_withdraw: RouteHandler<{ eventId: string }> = routes.withdraw
