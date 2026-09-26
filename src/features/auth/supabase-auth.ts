import { createServerClient } from '@supabase/ssr'
import type { CookieJar } from '@/lib/cookies'
import type { Db } from '@/lib/db'
import type { ConnectedEnv } from '@/lib/env'
import { HttpError } from '@/lib/http'
import type { SessionProvider } from './session'

/**
 * Supabase Auth through the SSR cookie client. Identity is always verified with `auth.getUser()`,
 * which contacts Supabase, never by trusting a cached session. Every sign-in also makes sure a
 * profile row exists so onboarding can resume.
 */

type ClientFactory = typeof createServerClient

function clientFor(env: ConnectedEnv, jar: CookieJar, factory: ClientFactory) {
  return factory(env.supabase.url, env.supabase.publishableKey, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (cookies) =>
        jar.setAll(cookies.map(({ name, value, options }) => ({ name, value, options }))),
    },
  })
}

async function ensureProfile(db: Db, userId: string): Promise<void> {
  await db.query('insert into profiles (id) values ($1) on conflict (id) do nothing', [userId])
}

export function supabaseSessionProvider(
  env: ConnectedEnv,
  db: Db,
  factory: ClientFactory = createServerClient,
): SessionProvider {
  return {
    kind: 'supabase',
    async signUp(jar, email, password) {
      const { data, error } = await clientFor(env, jar, factory).auth.signUp({ email, password })
      if (error || !data.user)
        throw new HttpError(400, 'sign_up_failed', error?.message ?? 'Could not create the account')
      await ensureProfile(db, data.user.id)
      return { userId: data.user.id, isEmailConfirmationPending: data.session === null }
    },
    async signIn(jar, email, password) {
      const { data, error } = await clientFor(env, jar, factory).auth.signInWithPassword({
        email,
        password,
      })
      if (error || !data.user)
        throw new HttpError(401, 'invalid_credentials', 'Email or password is incorrect')
      await ensureProfile(db, data.user.id)
      return data.user.id
    },
    async signOut(jar) {
      await clientFor(env, jar, factory).auth.signOut()
    },
    async userIdFrom(jar) {
      const { data } = await clientFor(env, jar, factory).auth.getUser()
      return data.user?.id ?? null
    },
  }
}
