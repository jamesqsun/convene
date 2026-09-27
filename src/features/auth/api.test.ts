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

  it('redirects to Google consent with the callback URI and carries the verifier cookie', async () => {
    const callbackUris: string[] = []
    const google: SessionProvider = {
      ...provider,
      startGoogleSignIn: async (jar, callbackUri) => {
        callbackUris.push(callbackUri)
        jar.setAll([{ name: 'sb-verifier', value: 'v', options: { httpOnly: true } }])
        return 'https://accounts.example/consent'
      },
    }
    const started = await authRoutes(async () => google).startGoogleSignIn(
      new Request('http://localhost:3000/api/auth/google'),
      noParams,
    )
    expect(started.status).toBe(302)
    expect(started.headers.get('location')).toBe('https://accounts.example/consent')
    expect(started.headers.get('set-cookie')).toContain('sb-verifier=v')
    expect(callbackUris).toEqual(['http://localhost:3000/api/auth/google/callback'])
  })

  it('completes Google sign-in with the returned code and lands on availability', async () => {
    const codes: string[] = []
    const google: SessionProvider = {
      ...provider,
      completeGoogleSignIn: async (jar, code) => {
        codes.push(code)
        jar.setAll([{ name: 'sb-token', value: 'jwt', options: { httpOnly: true } }])
        return 'user-id'
      },
    }
    const completed = await authRoutes(async () => google).completeGoogleSignIn(
      new Request('http://localhost:3000/api/auth/google/callback?code=abc'),
      noParams,
    )
    expect(completed.status).toBe(302)
    expect(completed.headers.get('location')).toBe('/availability')
    expect(completed.headers.get('set-cookie')).toContain('sb-token=jwt')
    expect(codes).toEqual(['abc'])
  })

  it('sends failed or unavailable Google sign-in back to the sign-in page', async () => {
    const routes = authRoutes(async () => provider)
    const started = await routes.startGoogleSignIn(
      new Request('http://localhost:3000/api/auth/google'),
      noParams,
    )
    expect(started.status).toBe(302)
    expect(started.headers.get('location')).toBe('/sign-in?error=google_unavailable')
    const denied = await routes.completeGoogleSignIn(
      new Request('http://localhost:3000/api/auth/google/callback?error=access_denied'),
      noParams,
    )
    expect(denied.headers.get('location')).toBe('/sign-in?error=google_failed')
    const rejected = await routes.completeGoogleSignIn(
      new Request('http://localhost:3000/api/auth/google/callback?code=abc'),
      noParams,
    )
    expect(rejected.headers.get('location')).toBe('/sign-in?error=google_unavailable')
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
