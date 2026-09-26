import { type SessionProvider, authedMutation, sessionProvider } from '@/features/auth/session'
import { getEnv } from '@/lib/env'
import { HttpError, type RouteHandler, jsonResponse } from '@/lib/http'
import { runJobsNow } from './run'

/** POST /api/demo/run-jobs: lets a signed-in demo visitor run the scheduler tick on demand. */
export function demoRunRoute(
  getProvider: () => Promise<SessionProvider>,
  isDemo: () => boolean,
  run: () => Promise<unknown>,
): RouteHandler {
  return authedMutation(async () => {
    if (!isDemo()) throw new HttpError(404, 'not_found', 'Not available')
    return jsonResponse(await run())
  }, getProvider)
}

export const POST = demoRunRoute(sessionProvider, () => getEnv().mode === 'demo', runJobsNow)
