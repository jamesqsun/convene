import { z } from 'zod'
import { after } from 'next/server'
import {
  authed,
  authedMutation,
  sessionProvider,
  type SessionProvider,
} from '@/features/auth/session'
import { getDb, type Db } from '@/lib/db'
import { getEnv, type Env } from '@/lib/env'
import { getProviders, type Providers } from '@/lib/providers'
import { HttpError, bearerToken, isSameSecret, jsonResponse, readJson, route } from '@/lib/http'
import { drainNotificationJobs } from '@/features/push/sender'
import { answerInterest, broadcastInterest, listInterestPrompts } from './store'
import { drainInterestMemories } from './jobs'

export const broadcastSchema = z
  .object({ requestId: z.uuid(), text: z.string().trim().min(1).max(400) })
  .strict()
interface Deps {
  getDatabase: () => Promise<Db>
  getProvider: () => Promise<SessionProvider>
  providers: () => Providers
  clock: () => number
  schedule: (work: () => Promise<void>) => void
}
function promptId(id: string) {
  if (!z.uuid().safeParse(id).success) throw new HttpError(404, 'prompt_missing', 'Topic not found')
  return id
}

export function interestRoutes(deps: Deps) {
  return {
    list: authed(
      async (_request, userId) =>
        jsonResponse({
          prompts: await listInterestPrompts(await deps.getDatabase(), userId, deps.clock()),
        }),
      deps.getProvider,
    ),
    detail: authed<{ id: string }>(async (_request, userId, { id }) => {
      const [prompt] = await listInterestPrompts(
        await deps.getDatabase(),
        userId,
        deps.clock(),
        promptId(id),
      )
      if (!prompt) throw new HttpError(404, 'prompt_missing', 'Topic not found')
      return jsonResponse({ prompt })
    }, deps.getProvider),
    answer: authedMutation<{ id: string }>(async (request, userId, { id }) => {
      const input = await readJson(request, z.object({ answer: z.enum(['yes', 'no']) }).strict())
      const db = await deps.getDatabase()
      const prompt = await answerInterest(db, userId, promptId(id), input.answer, deps.clock())
      if (!prompt.memoriesUpdated)
        deps.schedule(async () => {
          try {
            await drainInterestMemories(db, deps.providers().ai, deps.clock, { id, userId })
          } catch (error) {
            console.error('[interests] deferred update interrupted; worker will retry:', error)
          }
        })
      return jsonResponse({ prompt }, prompt.memoriesUpdated ? 200 : 202)
    }, deps.getProvider),
  }
}

export function broadcastRoute(env: Env, deps: Deps) {
  return route(async (request) => {
    if (env.mode !== 'supabase') throw new HttpError(404, 'not_found', 'Connected mode required')
    if (!isSameSecret(bearerToken(request), env.cronSecret))
      throw new HttpError(401, 'unauthorized', 'Invalid scheduler secret')
    const input = await readJson(request, broadcastSchema)
    const providers = deps.providers()
    if (providers.push.kind !== 'web_push')
      throw new HttpError(
        503,
        'push_not_configured',
        'Configure production VAPID keys before sending notifications',
      )
    const db = await deps.getDatabase()
    const result = await broadcastInterest(db, input.requestId, input.text, deps.clock())
    deps.schedule(async () => {
      try {
        let remaining = result.recipients
        while (remaining > 0) {
          const sent = await drainNotificationJobs(
            db,
            providers.push,
            deps.clock(),
            50,
            result.promptId,
          )
          if (!sent.claimed) break
          remaining -= sent.claimed
        }
      } catch (error) {
        console.error('[interests] push delivery interrupted; worker will retry:', error)
      }
    })
    return jsonResponse({ ...result, status: 'queued' }, 202)
  })
}

const deps: Deps = {
  getDatabase: getDb,
  getProvider: sessionProvider,
  providers: getProviders,
  clock: Date.now,
  schedule: after,
}
const routes = interestRoutes(deps)
export const GET = routes.list
export const GET_detail = routes.detail
export const POST_answer = routes.answer
export const POST_broadcast = (
  request: Request,
  context: Parameters<ReturnType<typeof broadcastRoute>>[1],
) => broadcastRoute(getEnv(), deps)(request, context)
