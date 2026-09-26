import { getDb } from '@/lib/db'
import { type CookieJar, cookieJarFor } from '@/lib/cookies'
import { getEnv } from '@/lib/env'
import {
  type AuthedHandler,
  HttpError,
  type RouteHandler,
  requireSameOrigin,
  route,
} from '@/lib/http'
import { demoSessionProvider } from './demo-auth'
import { supabaseSessionProvider } from './supabase-auth'

/**
 * Who is signed in. Two implementations: Supabase Auth via its SSR cookie client, and the demo
 * session (an HMAC-signed cookie, no passwords). Routes never touch either directly; they use
 * `authed` / `authedMutation`, which also flush any refreshed cookies onto the response.
 */

export interface SignUpResult {
  userId: string
  /** Connected mode with email confirmation enabled: the account exists but cannot sign in yet. */
  isEmailConfirmationPending: boolean
}

export interface SessionProvider {
  readonly kind: 'supabase' | 'demo'
  signUp(jar: CookieJar, email: string, password: string): Promise<SignUpResult>
  signIn(jar: CookieJar, email: string, password: string): Promise<string>
  signOut(jar: CookieJar): Promise<void>
  userIdFrom(jar: CookieJar): Promise<string | null>
}

let cached: Promise<SessionProvider> | null = null

export function sessionProvider(): Promise<SessionProvider> {
  cached ??= (async () => {
    const env = getEnv()
    const db = await getDb()
    return env.mode === 'demo' ? demoSessionProvider(db) : supabaseSessionProvider(env, db)
  })()
  return cached
}

/** Requires a signed-in user and applies any session cookies the provider refreshed. */
export function authed<Params>(
  fn: AuthedHandler<Params>,
  getProvider = sessionProvider,
): RouteHandler<Params> {
  return route(async (request, context) => {
    const jar = cookieJarFor(request)
    const userId = await (await getProvider()).userIdFrom(jar)
    if (!userId) throw new HttpError(401, 'unauthenticated', 'Sign in required')
    return jar.applyTo(await fn(request, userId, await context.params))
  })
}

export function authedMutation<Params>(
  fn: AuthedHandler<Params>,
  getProvider = sessionProvider,
): RouteHandler<Params> {
  return authed((request, userId, params) => {
    requireSameOrigin(request)
    return fn(request, userId, params)
  }, getProvider)
}
