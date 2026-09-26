import { z } from 'zod'
import {
  type SessionProvider,
  authed,
  authedMutation,
  sessionProvider,
} from '@/features/auth/session'
import type { AiProvider } from '@/features/ai/provider'
import { type Db, getDb } from '@/lib/db'
import { HttpError, type RouteHandler, jsonResponse, readJson } from '@/lib/http'
import { getProviders } from '@/lib/providers'
import { refreshDerived } from './derived'
import { generateMemories } from './generate'
import { memoryPatchSchema } from './schemas'
import { deleteMemory, listMemories, updateMemory } from './store'

export interface MemoryRouteDeps {
  getProvider: () => Promise<SessionProvider>
  getDatabase: () => Promise<Db>
  getAi: () => AiProvider
}

const idSchema = z.uuid()

function memoryId(params: { id?: string }): string {
  const parsed = idSchema.safeParse(params.id)
  if (!parsed.success) throw new HttpError(404, 'memory_missing', 'Memory not found')
  return parsed.data
}

export function memoryRoutes(deps: MemoryRouteDeps) {
  return {
    list: authed(
      async (_request, userId) =>
        jsonResponse({ memories: await listMemories(await deps.getDatabase(), userId) }),
      deps.getProvider,
    ),
    generate: authedMutation(
      async (_request, userId) =>
        jsonResponse(await generateMemories(await deps.getDatabase(), deps.getAi(), userId)),
      deps.getProvider,
    ),
    update: authedMutation<{ id: string }>(async (request, userId, params) => {
      const patch = await readJson(request, memoryPatchSchema)
      const db = await deps.getDatabase()
      const memory = await updateMemory(db, userId, memoryId(params), patch)
      if (!memory) throw new HttpError(404, 'memory_missing', 'Memory not found')
      await refreshDerived(db, deps.getAi(), userId)
      return jsonResponse({ memory })
    }, deps.getProvider),
    remove: authedMutation<{ id: string }>(async (_request, userId, params) => {
      const db = await deps.getDatabase()
      if (!(await deleteMemory(db, userId, memoryId(params))))
        throw new HttpError(404, 'memory_missing', 'Memory not found')
      await refreshDerived(db, deps.getAi(), userId)
      return new Response(null, { status: 204 })
    }, deps.getProvider),
  }
}

const routes = memoryRoutes({
  getProvider: sessionProvider,
  getDatabase: getDb,
  getAi: () => getProviders().ai,
})
export const GET: RouteHandler = routes.list
export const POST_generate: RouteHandler = routes.generate
export const PATCH: RouteHandler<{ id: string }> = routes.update
export const DELETE: RouteHandler<{ id: string }> = routes.remove
