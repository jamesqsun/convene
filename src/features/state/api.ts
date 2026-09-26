import { type SessionProvider, authed, sessionProvider } from '@/features/auth/session'
import { type Db, getDb } from '@/lib/db'
import { getEnv } from '@/lib/env'
import { type RouteHandler, jsonResponse } from '@/lib/http'
import { loadState } from './read'

export interface StateRouteDeps {
  getProvider: () => Promise<SessionProvider>
  getDatabase: () => Promise<Db>
  clock: () => number
  mode: () => 'demo' | 'supabase'
}

/** GET /api/state: the one read the shell polls while visible. */
export function stateRoute(deps: StateRouteDeps): RouteHandler {
  return authed(async (_request, userId) => {
    const state = await loadState(await deps.getDatabase(), userId, deps.clock())
    return jsonResponse({ ...state, mode: deps.mode() })
  }, deps.getProvider)
}

export const GET = stateRoute({
  getProvider: sessionProvider,
  getDatabase: getDb,
  clock: Date.now,
  mode: () => getEnv().mode,
})
