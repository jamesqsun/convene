import { authedMutation, sessionProvider } from '@/features/auth/session'
import { after } from 'next/server'
import type { AiProvider } from '@/features/ai/provider'
import { getDb } from '@/lib/db'
import { jsonResponse, readJson } from '@/lib/http'
import { getProviders } from '@/lib/providers'
import type { FeedbackRouteDeps } from './api'
import { eventFeedbackSchema, saveEventFeedback } from './event'
import { drainFeedbackMemoryJobs, retryFeedbackMemoryJob } from './memory-jobs'

export function eventFeedbackRoute(
  deps: FeedbackRouteDeps & {
    getAi: () => AiProvider
    schedule: (work: () => Promise<void>) => void
  },
) {
  return authedMutation(async (request, userId) => {
    const input = await readJson(request, eventFeedbackSchema)
    const db = await deps.getDatabase()
    const saved = await saveEventFeedback(db, userId, input, deps.clock())
    if (!saved.done) {
      await retryFeedbackMemoryJob(db, input.eventId, userId, deps.clock())
      deps.schedule(async () => {
        try {
          await drainFeedbackMemoryJobs(db, deps.getAi(), deps.clock, {
            eventId: input.eventId,
            userId,
          })
        } catch (error) {
          console.error('[feedback] background processing interrupted; worker will retry:', error)
        }
      })
    }
    return jsonResponse(
      { feedback: { text: input.text, memoriesUpdated: saved.done }, notice: null },
      saved.done ? 200 : 202,
    )
  }, deps.getProvider)
}
export const POST = eventFeedbackRoute({
  getProvider: sessionProvider,
  getDatabase: getDb,
  getAi: () => getProviders().ai,
  clock: Date.now,
  schedule: after,
})
