import { type SessionProvider, authed, sessionProvider } from '@/features/auth/session'
import { type Db, getDb } from '@/lib/db'
import { type RouteHandler, jsonResponse } from '@/lib/http'
import { loadGraph } from './read'

export interface GraphRouteDeps {
  getProvider: () => Promise<SessionProvider>
  getDatabase: () => Promise<Db>
  clock: () => number
}

export function graphRoute(deps: GraphRouteDeps): RouteHandler {
  return authed(async (_request, userId) => {
    const now = deps.clock()
    return jsonResponse({
      serverNow: now,
      nodes: await loadGraph(await deps.getDatabase(), userId, now),
    })
  }, deps.getProvider)
}

export const GET = graphRoute({ getProvider: sessionProvider, getDatabase: getDb, clock: Date.now })
