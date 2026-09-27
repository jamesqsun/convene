import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { CookieJar } from '@/lib/cookies'
import type { Db } from '@/lib/db'
import { HttpError } from '@/lib/http'
import type { SessionProvider } from './session'

/**
 * Demo-mode sessions. Email only, password ignored, cookie signed with a per-process secret so a
 * forged cookie cannot impersonate a persona. Nothing here is suitable for real accounts.
 */

export const demoSessionCookie = 'convene_demo_session'
const thirtyDays = 30 * 24 * 3600

const globalState = globalThis as unknown as { __conveneDemoSecret?: Buffer }

function demoSecret(): Buffer {
  globalState.__conveneDemoSecret ??= randomBytes(32)
  return globalState.__conveneDemoSecret
}

function sign(userId: string, secret: Buffer): string {
  return createHmac('sha256', secret).update(userId).digest('base64url')
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function googleUnavailable(): HttpError {
  return new HttpError(404, 'google_unavailable', 'Google sign-in is not available in demo mode')
}

function setSession(jar: CookieJar, userId: string, secret: Buffer): void {
  jar.setAll([
    {
      name: demoSessionCookie,
      value: `${userId}.${sign(userId, secret)}`,
      options: { httpOnly: true, sameSite: 'lax', path: '/', maxAge: thirtyDays },
    },
  ])
}

export function demoSessionProvider(db: Db, secret: Buffer = demoSecret()): SessionProvider {
  return {
    kind: 'demo',
    async signUp(jar, email) {
      const normalized = normalizeEmail(email)
      const existing = await db.query('select 1 from auth.users where email = $1', [normalized])
      if (existing.length > 0)
        throw new HttpError(409, 'email_taken', 'An account with that email already exists')
      const rows = await db.query<{ id: string }>(
        'insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id',
        [normalized],
      )
      const userId = rows[0]!.id
      await db.query('insert into profiles (id) values ($1)', [userId])
      setSession(jar, userId, secret)
      return { userId, isEmailConfirmationPending: false }
    },
    async signIn(jar, email) {
      const rows = await db.query<{ id: string }>('select id from auth.users where email = $1', [
        normalizeEmail(email),
      ])
      const userId = rows[0]?.id
      if (!userId)
        throw new HttpError(401, 'invalid_credentials', 'No demo account with that email')
      setSession(jar, userId, secret)
      return userId
    },
    async startGoogleSignIn() {
      throw googleUnavailable()
    },
    async completeGoogleSignIn() {
      throw googleUnavailable()
    },
    async signOut(jar) {
      jar.setAll([
        {
          name: demoSessionCookie,
          value: '',
          options: { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 },
        },
      ])
    },
    async userIdFrom(jar) {
      const raw = jar.getAll().find((cookie) => cookie.name === demoSessionCookie)?.value
      if (!raw) return null
      const [userId, signature] = raw.split('.')
      if (!userId || !signature) return null
      const expected = Buffer.from(sign(userId, secret))
      const given = Buffer.from(signature)
      return expected.length === given.length && timingSafeEqual(expected, given) ? userId : null
    },
  }
}
