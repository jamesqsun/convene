import { z } from 'zod'
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
): RouteHandler {
  return route(async (request) => {
    if (env.mode !== 'supabase') throw new HttpError(404, 'not_found', 'Not available in demo mode')
    if (!isSameSecret(bearerToken(request), env.cronSecret))
      throw new HttpError(401, 'unauthorized', 'Invalid scheduler secret')
    await readJson(request, z.object({}).strict())
    return jsonResponse(await run())
  })
}

export const POST: RouteHandler = (request, context) =>
  completeEventsHandler(getEnv(), async () => completeAllEvents(await getDb(), Date.now()))(
    request,
    context,
  )
