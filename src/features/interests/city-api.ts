import { z } from 'zod'
import { after } from 'next/server'
import { getDb, type Db } from '@/lib/db'
import { getEnv, type Env } from '@/lib/env'
import { getProviders } from '@/lib/providers'
import { HttpError, bearerToken, isSameSecret, jsonResponse, readJson, route } from '@/lib/http'
import { drainNotificationJobs } from '@/features/push/sender'
import { museCitySearch, type CitySearch } from './city-search'
import { drainCityInterests, enqueueCityInterests } from './city-jobs'

interface Deps {
  db: () => Promise<Db>
  search: CitySearch
  clock: () => number
  deliver: () => void
}

/** Each request processes two cities; durable leftovers are resumed by the worker or force script. */
export function cityInterestsHandler(env: Env, deps: Deps) {
  return route(async (request) => {
    if (env.mode !== 'supabase') throw new HttpError(404, 'not_found', 'Connected mode required')
    if (!isSameSecret(bearerToken(request), env.cronSecret))
      throw new HttpError(401, 'unauthorized', 'Invalid scheduler secret')
    const { force = false } =
      request.method === 'POST'
        ? await readJson(request, z.object({ force: z.boolean().optional() }).strict())
        : {}
    if (!env.meta || !env.vapid)
      throw new HttpError(
        503,
        'city_interests_not_configured',
        'Meta and VAPID credentials are required',
      )
    const db = await deps.db()
    const cities = await enqueueCityInterests(db, deps.clock(), force)
    const result = await drainCityInterests(db, deps.search, deps.clock)
    const [pending] = await db.query<{ remaining: number }>(
      `select count(*)::int as remaining from city_interest_jobs
      where status in ('pending','running','failed') and attempts < 5
      and next_attempt_at <= $1::timestamptz and (lease_until is null or lease_until < $1::timestamptz)
      and local_date = ($1::timestamptz at time zone timezone)::date`,
      [new Date(deps.clock()).toISOString()],
    )
    deps.deliver()
    return jsonResponse({ cities, ...result, remaining: pending!.remaining })
  })
}

/** Uses the post-response budget to finish queued cities and send notifications; worker recovers interruptions. */
export async function resumeCityInterests() {
  const env = getEnv()
  if (env.mode !== 'supabase' || !env.meta || !env.vapid) return
  const db = await getDb(),
    search = museCitySearch(env.meta)
  try {
    await drainCityInterests(db, search, Date.now)
    const deliveryStarted = Date.now()
    while (
      (await drainNotificationJobs(db, getProviders().push, Date.now())).claimed === 50 &&
      Date.now() - deliveryStarted < 30_000
    ) {}
  } catch (error) {
    console.error('[city-interests] background pass interrupted; worker will retry:', error)
  }
}

export const POST = (
  request: Request,
  context: Parameters<ReturnType<typeof cityInterestsHandler>>[1],
) => {
  const env = getEnv()
  return cityInterestsHandler(env, {
    db: getDb,
    search:
      env.mode === 'supabase' && env.meta
        ? museCitySearch(env.meta)
        : async () => {
            throw new Error('Meta is not configured')
          },
    clock: Date.now,
    deliver: () => after(resumeCityInterests),
  })(request, context)
}
