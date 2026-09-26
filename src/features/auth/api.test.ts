import { beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '@/lib/db'
import { noParams } from '@/lib/http'
import { createTestDb } from '../../../supabase/tests/harness'
import { authRoutes, demoPersonasRoute } from './api'
import { demoSessionProvider } from './demo-auth'
import type { SessionProvider } from './session'

let db: Db
let provider: SessionProvider

beforeAll(async () => {
  db = await createTestDb()
  provider = demoSessionProvider(db)
})

function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost:3000${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
      host: 'localhost:3000',
      origin: 'http://localhost:3000',
      ...headers,
    },
  })
}

describe('auth routes', () => {
  it('signs up, signs in, and signs out with cookies', async () => {
    const routes = authRoutes(async () => provider)
    const signedUp = await routes.signUp(
      post('/api/auth/sign-up', { email: 'maya@example.com', password: 'password1' }),
      noParams,
    )
    expect(signedUp.status).toBe(201)
    const cookie = signedUp.headers.get('set-cookie')!.split(';')[0]!
    const { userId } = (await signedUp.json()) as { userId: string }

    const signedIn = await routes.signIn(
      post('/api/auth/sign-in', { email: 'maya@example.com', password: 'password1' }),
      noParams,
    )
    expect(await signedIn.json()).toEqual({ userId })

    const signedOut = await routes.signOut(post('/api/auth/sign-out', {}, { cookie }), noParams)
    expect(signedOut.status).toBe(204)
    expect(signedOut.headers.get('set-cookie')).toContain('Max-Age=0')
    expect((await routes.signOut(post('/api/auth/sign-out', {}), noParams)).status).toBe(401)
  })

  it('validates credentials and rejects cross-origin calls', async () => {
    const routes = authRoutes(async () => provider)
    expect(
      (
        await routes.signUp(
          post('/api/auth/sign-up', { email: 'nope', password: 'password1' }),
          noParams,
        )
      ).status,
    ).toBe(400)
    expect(
      (
        await routes.signUp(
          post('/api/auth/sign-up', { email: 'a@b.co', password: 'short' }),
          noParams,
        )
      ).status,
    ).toBe(400)
    expect(
      (
        await routes.signUp(
          post('/api/auth/sign-up', { email: 'a@b.co', password: 'password1', role: 'admin' }),
          noParams,
        )
      ).status,
    ).toBe(400)
    const foreign = post(
      '/api/auth/sign-in',
      { email: 'a@b.co', password: 'password1' },
      { origin: 'https://evil.example' },
    )
    expect((await routes.signIn(foreign, noParams)).status).toBe(403)
  })

  it('lists demo personas only in demo mode', async () => {
    await db.query(
      "insert into auth.users (id, email) values (gen_random_uuid(), 'ben@convene.demo')",
    )
    const id = (
      await db.query<{ id: string }>("select id from auth.users where email = 'ben@convene.demo'")
    )[0]!.id
    await db.query("insert into profiles (id, name, city_name) values ($1, 'Ben', 'Toronto')", [id])
    const get = new Request('http://localhost:3000/api/auth/demo-personas')
    const demo = await demoPersonasRoute(
      async () => db,
      () => true,
    )(get, noParams)
    expect(await demo.json()).toEqual({
      personas: [{ email: 'ben@convene.demo', name: 'Ben', cityLabel: 'Toronto' }],
    })
    expect(
      (
        await demoPersonasRoute(
          async () => db,
          () => false,
        )(get, noParams)
      ).status,
    ).toBe(404)
  })
})
