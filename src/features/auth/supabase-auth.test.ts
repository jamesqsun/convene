import { beforeAll, describe, expect, it, vi } from 'vitest'
import { cookieJarFor } from '@/lib/cookies'
import type { Db } from '@/lib/db'
import { readEnv } from '@/lib/env'
import { createTestDb } from '../../../supabase/tests/harness'
import { supabaseSessionProvider } from './supabase-auth'

const env = readEnv({
  CONVENE_MODE: 'supabase',
  DATABASE_URL: 'postgresql://u:p@h/db',
  NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'pk',
  SUPABASE_SERVICE_ROLE_KEY: 'sk',
  CRON_SECRET: 'a-very-long-random-secret',
})
if (env.mode !== 'supabase') throw new Error('expected connected env')

let db: Db
const userId = '11111111-1111-4111-8111-111111111111'

beforeAll(async () => {
  db = await createTestDb()
  await db.query('insert into auth.users (id, email) values ($1, $2)', [userId, 'real@example.com'])
})

function stubFactory(auth: Record<string, unknown>) {
  const factory = vi.fn(
    (
      _url: string,
      _key: string,
      options: {
        cookies: { setAll: (c: { name: string; value: string; options: object }[]) => void }
      },
    ) => {
      options.cookies.setAll([{ name: 'sb-token', value: 'jwt', options: { httpOnly: true } }])
      return { auth }
    },
  )
  return factory as unknown as Parameters<typeof supabaseSessionProvider>[2]
}

const jar = () => cookieJarFor(new Request('http://localhost/'))

describe('supabaseSessionProvider', () => {
  it('signs up, ensures a profile row, and reports pending confirmation', async () => {
    const provider = supabaseSessionProvider(
      env,
      db,
      stubFactory({
        signUp: async () => ({ data: { user: { id: userId }, session: null }, error: null }),
      }),
    )
    const j = jar()
    expect(await provider.signUp(j, 'real@example.com', 'password1')).toEqual({
      userId,
      isEmailConfirmationPending: true,
    })
    expect(await db.query('select 1 from profiles where id = $1', [userId])).toHaveLength(1)
    expect(j.applyTo(new Response()).headers.get('set-cookie')).toContain('sb-token=jwt')
  })

  it('maps sign-in failures to 401 and reads the user through getUser', async () => {
    const failing = supabaseSessionProvider(
      env,
      db,
      stubFactory({
        signInWithPassword: async () => ({ data: { user: null }, error: { message: 'bad' } }),
      }),
    )
    await expect(failing.signIn(jar(), 'real@example.com', 'nope')).rejects.toMatchObject({
      status: 401,
    })
    const working = supabaseSessionProvider(
      env,
      db,
      stubFactory({
        signInWithPassword: async () => ({ data: { user: { id: userId } }, error: null }),
        getUser: async () => ({ data: { user: { id: userId } } }),
        signOut: async () => ({ error: null }),
      }),
    )
    expect(await working.signIn(jar(), 'real@example.com', 'password1')).toBe(userId)
    expect(await working.userIdFrom(jar())).toBe(userId)
    await expect(working.signOut(jar())).resolves.toBeUndefined()
    const anonymous = supabaseSessionProvider(
      env,
      db,
      stubFactory({ getUser: async () => ({ data: { user: null } }) }),
    )
    expect(await anonymous.userIdFrom(jar())).toBeNull()
  })
})
