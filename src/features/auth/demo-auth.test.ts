import { randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { cookieJarFor } from '@/lib/cookies'
import type { Db } from '@/lib/db'
import { createTestDb } from '../../../supabase/tests/harness'
import { demoSessionCookie, demoSessionProvider } from './demo-auth'

let db: Db
const secret = randomBytes(32)

beforeAll(async () => {
  db = await createTestDb()
})

function jarWith(cookie?: string) {
  return cookieJarFor(new Request('http://localhost/', { headers: cookie ? { cookie } : {} }))
}

function sessionCookieFrom(jar: ReturnType<typeof jarWith>): string {
  return jar.getAll().find((c) => c.name === demoSessionCookie)!.value
}

describe('demoSessionProvider', () => {
  it('signs up, creates a profile, and round-trips the session cookie', async () => {
    const provider = demoSessionProvider(db, secret)
    const jar = jarWith()
    const { userId } = await provider.signUp(jar, ' Maya@Example.com ', 'ignored')
    expect(await db.query('select 1 from profiles where id = $1', [userId])).toHaveLength(1)
    const cookie = sessionCookieFrom(jar)
    expect(
      await provider.userIdFrom(jarWith(`${demoSessionCookie}=${encodeURIComponent(cookie)}`)),
    ).toBe(userId)
    expect(await provider.signIn(jarWith(), 'maya@example.com', '')).toBe(userId)
  })

  it('rejects duplicate sign-ups, unknown sign-ins, and tampered cookies', async () => {
    const provider = demoSessionProvider(db, secret)
    await provider.signUp(jarWith(), 'ben@example.com', '')
    await expect(provider.signUp(jarWith(), 'BEN@example.com', '')).rejects.toMatchObject({
      status: 409,
    })
    await expect(provider.signIn(jarWith(), 'nobody@example.com', '')).rejects.toMatchObject({
      status: 401,
    })
    const jar = jarWith()
    const { userId } = await provider.signUp(jar, 'chloe@example.com', '')
    const [, signature] = sessionCookieFrom(jar).split('.')
    const forged = `${demoSessionCookie}=${userId}.${signature!.slice(0, -2)}xx`
    expect(await provider.userIdFrom(jarWith(forged))).toBeNull()
    expect(await provider.userIdFrom(jarWith(`${demoSessionCookie}=garbage`))).toBeNull()
    expect(
      await demoSessionProvider(db, randomBytes(32)).userIdFrom(
        jarWith(`${demoSessionCookie}=${sessionCookieFrom(jar)}`),
      ),
    ).toBeNull()
  })

  it('signs out by expiring the cookie', async () => {
    const provider = demoSessionProvider(db, secret)
    const jar = jarWith()
    await provider.signOut(jar)
    const response = jar.applyTo(new Response())
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0')
  })
})
