import webpush from 'web-push'
import {
  type SessionProvider,
  authed,
  authedMutation,
  sessionProvider,
} from '@/features/auth/session'
import { type Db, getDb } from '@/lib/db'
import { getEnv } from '@/lib/env'
import { type RouteHandler, jsonResponse, readJson } from '@/lib/http'
import { subscriptionInputSchema, unsubscribeInputSchema } from './schemas'
import { removeSubscription, saveSubscription } from './store'

export interface PushRouteDeps {
  getProvider: () => Promise<SessionProvider>
  getDatabase: () => Promise<Db>
  publicKey: () => string | null
}

const globalState = globalThis as unknown as {
  __conveneDemoVapid?: { publicKey: string; privateKey: string }
}

/** Demo mode has no configured keys; a throwaway pair lets the browser subscribe for the fake sender. */
export function demoVapidPublicKey(): string {
  globalState.__conveneDemoVapid ??= webpush.generateVAPIDKeys()
  return globalState.__conveneDemoVapid.publicKey
}

function configuredPublicKey(): string | null {
  const env = getEnv()
  if (env.mode === 'demo') return demoVapidPublicKey()
  return env.vapid?.publicKey ?? null
}

export function pushRoutes(deps: PushRouteDeps) {
  return {
    publicKey: authed(async () => jsonResponse({ publicKey: deps.publicKey() }), deps.getProvider),
    subscribe: authedMutation(async (request, userId) => {
      const input = await readJson(request, subscriptionInputSchema)
      const id = await saveSubscription(
        await deps.getDatabase(),
        userId,
        input,
        request.headers.get('user-agent'),
      )
      return jsonResponse({ id }, 201)
    }, deps.getProvider),
    unsubscribe: authedMutation(async (request, userId) => {
      const input = await readJson(request, unsubscribeInputSchema)
      await removeSubscription(await deps.getDatabase(), userId, input.endpoint)
      return new Response(null, { status: 204 })
    }, deps.getProvider),
  }
}

const routes = pushRoutes({
  getProvider: sessionProvider,
  getDatabase: getDb,
  publicKey: configuredPublicKey,
})
export const GET_publicKey: RouteHandler = routes.publicKey
export const POST_subscribe: RouteHandler = routes.subscribe
export const DELETE_subscribe: RouteHandler = routes.unsubscribe
