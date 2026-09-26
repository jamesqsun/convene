import { beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '@/lib/db'
import { noParams } from '@/lib/http'
import {
  createTestDb,
  createUser,
  jsonRequest,
  stubSessionProvider,
} from '../../../supabase/tests/harness'
import { demoVapidPublicKey, pushRoutes } from './api'

let db: Db

beforeAll(async () => {
  db = await createTestDb()
})

describe('push routes', () => {
  it('exposes the public key and manages the caller’s subscriptions', async () => {
    const userId = await createUser(db)
    const routesFor = (id: string | null) =>
      pushRoutes({
        getProvider: async () => stubSessionProvider(id),
        getDatabase: async () => db,
        publicKey: () => 'pub',
      })
    expect(
      (await routesFor(null).publicKey(jsonRequest('GET', '/api/push/public-key'), noParams))
        .status,
    ).toBe(401)
    expect(
      await (
        await routesFor(userId).publicKey(jsonRequest('GET', '/api/push/public-key'), noParams)
      ).json(),
    ).toEqual({ publicKey: 'pub' })
    const subscription = {
      endpoint: 'https://push.example/dev',
      keys: { p256dh: 'k', auth: 'x' },
      expirationTime: null,
    }
    const created = await routesFor(userId).subscribe(
      jsonRequest('POST', '/api/push/subscriptions', subscription),
      noParams,
    )
    expect(created.status).toBe(201)
    expect(
      (
        await routesFor(userId).subscribe(
          jsonRequest('POST', '/api/push/subscriptions', { ...subscription, extra: 1 }),
          noParams,
        )
      ).status,
    ).toBe(400)
    expect(
      (
        await routesFor(userId).unsubscribe(
          jsonRequest('DELETE', '/api/push/subscriptions', { endpoint: subscription.endpoint }),
          noParams,
        )
      ).status,
    ).toBe(204)
    expect(await db.query('select 1 from push_subscriptions')).toEqual([])
  })

  it('generates a stable demo VAPID key per process', () => {
    expect(demoVapidPublicKey()).toBe(demoVapidPublicKey())
    expect(demoVapidPublicKey().length).toBeGreaterThan(20)
  })
})
