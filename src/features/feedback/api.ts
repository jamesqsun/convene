import { type SessionProvider, authedMutation, sessionProvider } from '@/features/auth/session'
import { type Db, getDb } from '@/lib/db'
import { type RouteHandler, jsonResponse, readJson } from '@/lib/http'
import { feedbackInputSchema } from './schemas'
import { submitFeedback } from './store'

export interface FeedbackRouteDeps {
  getProvider: () => Promise<SessionProvider>
  getDatabase: () => Promise<Db>
  clock: () => number
}

export function feedbackRoute(deps: FeedbackRouteDeps): RouteHandler {
  return authedMutation(async (request, userId) => {
    const input = await readJson(request, feedbackInputSchema)
    return jsonResponse(await submitFeedback(await deps.getDatabase(), userId, input, deps.clock()))
  }, deps.getProvider)
}

export const POST = feedbackRoute({
  getProvider: sessionProvider,
  getDatabase: getDb,
  clock: Date.now,
})
