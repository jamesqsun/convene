import { z } from 'zod'
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
import { runJobsNow } from './run'

/**
 * /api/jobs/run: the scheduler entry point. The worker script POSTs it; Vercel Cron GETs it (and
 * attaches the CRON_SECRET bearer itself). Both carry the shared secret. In demo mode this route
 * does not exist; the signed-in demo route is used instead.
 */
export function jobsHandler(
  env: Env,
  run: (options?: { allBatches?: boolean }) => Promise<unknown>,
): RouteHandler {
  return route(async (request) => {
    if (env.mode !== 'supabase') throw new HttpError(404, 'not_found', 'Not available in demo mode')
    if (!isSameSecret(bearerToken(request), env.cronSecret)) {
      throw new HttpError(401, 'unauthorized', 'Invalid scheduler secret')
    }
    const options =
      request.method === 'POST'
        ? await readJson(request, z.object({ allBatches: z.boolean().optional() }).strict())
        : {}
    return jsonResponse(await run(options))
  })
}

export const POST: RouteHandler = (request, context) =>
  jobsHandler(getEnv(), runJobsNow)(request, context)
