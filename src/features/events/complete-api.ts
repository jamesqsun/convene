import { z } from 'zod'
import { after } from 'next/server'
import { getProviders } from '@/lib/providers'
import { defaultDrainLimit, drainNotificationJobs } from '@/features/push/sender'
import { getDb } from '@/lib/db'
import { type Env, getEnv } from '@/lib/env'
import {
  HttpError,
  type RouteHandler,
  bearerToken,
  isSameSecret,
  jsonResponse,
  readJson,
  route,
} from '@/lib/http'
import { completeAllEvents } from './complete'

export function completeEventsHandler(
  env: Env,
  run: () => Promise<{ completed: number }>,
  scheduleDelivery: () => void = () => {},
): RouteHandler {
  return route(async (request) => {
    if (env.mode !== 'supabase') throw new HttpError(404, 'not_found', 'Not available in demo mode')
    if (!isSameSecret(bearerToken(request), env.cronSecret))
      throw new HttpError(401, 'unauthorized', 'Invalid scheduler secret')
    await readJson(request, z.object({}).strict())
    const result = await run()
    scheduleDelivery()
    return jsonResponse(result)
  })
}

export const POST: RouteHandler = (request, context) =>
  completeEventsHandler(
    getEnv(),
    async () => completeAllEvents(await getDb(), Date.now()),
    () =>
      after(async () => {
        try {
          const db = await getDb(),
            push = getProviders().push
          // Drain all currently due jobs; transient failures remain queued for the worker.
          while (
            (await drainNotificationJobs(db, push, Date.now())).claimed === defaultDrainLimit
          ) {}
        } catch (error) {
          console.error('[complete-events] delivery interrupted; worker will retry:', error)
        }
      }),
  )(request, context)
