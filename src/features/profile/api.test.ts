import { beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '@/lib/db'
import { noParams } from '@/lib/http'
import { createTestDb, createUser } from '../../../supabase/tests/harness'
import type { SessionProvider } from '@/features/auth/session'
import { profileRoutes } from './api'

let db: Db
let userId: string

beforeAll(async () => {
  db = await createTestDb()
  userId = await createUser(db, { isOnboarded: false })
  await db.query(
    "update profiles set name = '', age = null, city_key = null, city_timezone = null, city_name = null, phone_e164 = null where id = $1",
    [userId],
  )
})

function stubProvider(id: string | null): SessionProvider {
  return {
    kind: 'demo',
    signUp: async () => ({ userId: '', isEmailConfirmationPending: false }),
    signIn: async () => '',
    startGoogleSignIn: async () => '',
    completeGoogleSignIn: async () => '',
    signOut: async () => undefined,
    userIdFrom: async () => id,
  }
}

const routesFor = (id: string | null) =>
  profileRoutes({ getProvider: async () => stubProvider(id), getDatabase: async () => db })

function patch(body: unknown): Request {
  return new Request('http://localhost:3000/api/profile', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
      host: 'localhost:3000',
      origin: 'http://localhost:3000',
    },
  })
}

const get = () => new Request('http://localhost:3000/api/profile')

describe('profile routes', () => {
  it('requires a session', async () => {
    expect((await routesFor(null).get(get(), noParams)).status).toBe(401)
    expect((await routesFor(null).patch(patch({ name: 'x' }), noParams)).status).toBe(401)
  })

  it('resumes onboarding at the derived step and resolves city and phone server-side', async () => {
    const routes = routesFor(userId)
    let body = (await (await routes.get(get(), noParams)).json()) as {
      profile: { onboardingStep: string }
    }
    expect(body.profile.onboardingStep).toBe('basics')

    expect(
      (await routes.patch(patch({ name: 'Maya', age: 29, budget: 10 }), noParams)).status,
    ).toBe(400)
    await routes.patch(patch({ name: 'Maya', age: 29 }), noParams)
    expect((await routes.patch(patch({ cityKey: 'xx:nowhere:nothing' }), noParams)).status).toBe(
      422,
    )
    body = (await (
      await routes.patch(patch({ cityKey: 'ca:ontario:toronto' }), noParams)
    ).json()) as never
    expect(body.profile.onboardingStep).toBe('phone')
    expect((await routes.patch(patch({ phone: '416 555 0100' }), noParams)).status).toBe(400)
    const withPhone = (await (
      await routes.patch(patch({ phone: '+1 (416) 555-0100', interests: ['coffee'] }), noParams)
    ).json()) as { profile: { phone: string; onboardingStep: string } }
    expect(withPhone.profile.phone).toBe('+14165550100')
    expect(withPhone.profile.onboardingStep).toBe('answers')
  })
})
