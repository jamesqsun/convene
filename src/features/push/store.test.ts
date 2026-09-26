import { beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '@/lib/db'
import { createTestDb, createUser } from '../../../supabase/tests/harness'
import { hasActiveSubscription, removeSubscription, saveSubscription } from './store'

let db: Db

beforeAll(async () => {
  db = await createTestDb()
})

describe('push subscription store', () => {
  it('upserts by endpoint, reassigns owners, revives retired rows, and deletes owner-only', async () => {
    const a = await createUser(db)
    const b = await createUser(db)
    const input = { endpoint: 'https://push.example/dev', keys: { p256dh: 'k', auth: 'x' } }
    const id = await saveSubscription(db, a, input, 'ua')
    await db.query('update push_subscriptions set retired_at = now() where id = $1', [id])
    expect(await hasActiveSubscription(db, a, input.endpoint)).toBe(false)
    expect(
      await saveSubscription(db, b, { ...input, keys: { p256dh: 'k2', auth: 'x2' } }, null),
    ).toBe(id)
    expect(await hasActiveSubscription(db, b, input.endpoint)).toBe(true)
    expect(await hasActiveSubscription(db, a, input.endpoint)).toBe(false)
    expect(await removeSubscription(db, a, input.endpoint)).toBe(false)
    expect(await removeSubscription(db, b, input.endpoint)).toBe(true)
  })
})
