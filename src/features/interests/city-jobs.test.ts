import { expect, it, vi } from 'vitest'
import { createTestDb, createUser, count } from '../../../supabase/tests/harness'
import { drainCityInterests, enqueueCityInterests } from './city-jobs'
import type { CitySearch } from './city-search'
import { CitySearchSkipped } from './city-search'
import { listInterestPrompts } from './store'

it('discovers every city, scopes recipients, preserves sources, and deduplicates concurrent and forced runs', async () => {
  const db = await createTestDb(),
    now = Date.parse('2026-10-01T16:00:00Z')
  const a = await createUser(db, { cityKey: 'toronto' }),
    b = await createUser(db, { cityKey: 'montreal' }),
    c = await createUser(db, { cityKey: 'toronto' })
  for (const [user, endpoint] of [
    [a, 'a'],
    [a, 'a2'],
    [b, 'b'],
  ])
    await db.query(
      "insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, 'k', 'a')",
      [user, `https://push/${endpoint}`],
    )
  expect(await enqueueCityInterests(db, now)).toBe(2)
  const search = vi.fn<CitySearch>(async (city) => ({
    text: `${city.key} festival on October 3`,
    date: '2026-10-03',
    sourceUrl: `https://example.com/${city.key}`,
  }))
  await Promise.all([
    drainCityInterests(db, search, () => now),
    drainCityInterests(db, search, () => now),
  ])
  expect(search).toHaveBeenCalledTimes(2)
  expect(await count(db, 'notification_jobs')).toBe(2)
  expect((await listInterestPrompts(db, a, now))[0]).toMatchObject({
    text: 'toronto festival on October 3',
    sourceUrl: 'https://example.com/toronto',
  })
  expect((await listInterestPrompts(db, b, now))[0]!.text).toContain('montreal')
  expect(await listInterestPrompts(db, c, now)).toEqual([])
  await enqueueCityInterests(db, now, true)
  expect((await drainCityInterests(db, search, () => now)).claimed).toBe(0)
  await enqueueCityInterests(db, now + 86400000)
  expect((await drainCityInterests(db, search, () => now + 86400000)).skipped).toBe(2)
  expect(await count(db, 'notification_jobs')).toBe(2)
})

it('isolates city failures, retries with backoff, and skips unverified events', async () => {
  const db = await createTestDb(),
    now = Date.parse('2026-10-01T16:00:00Z')
  await createUser(db, { cityKey: 'a' })
  await createUser(db, { cityKey: 'b' })
  await enqueueCityInterests(db, now)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const search: CitySearch = async (city) => {
    if (city.key === 'a') throw new Error('Search unavailable')
    return null
  }
  expect(await drainCityInterests(db, search, () => now)).toMatchObject({
    claimed: 2,
    sent: 0,
    failed: 1,
    skipped: 1,
  })
  expect((await drainCityInterests(db, search, () => now)).claimed).toBe(0)
  expect(
    (
      await drainCityInterests(
        db,
        async () => null,
        () => now + 120001,
      )
    ).skipped,
  ).toBe(1)
  await enqueueCityInterests(db, now + 120002, true)
  expect(
    (
      await drainCityInterests(
        db,
        async () => null,
        () => now + 120002,
      )
    ).claimed,
  ).toBe(2)
})

it('reports and saves a missing-citation skip without queueing notifications', async () => {
  const db = await createTestDb(),
    now = Date.now()
  await createUser(db)
  await enqueueCityInterests(db, now)
  const result = await drainCityInterests(
    db,
    async () => {
      throw new CitySearchSkipped('no_cited_sources')
    },
    () => now,
  )
  expect(result).toMatchObject({
    sent: 0,
    skipped: 1,
    failed: 0,
    details: [
      { status: 'skipped', recipients: 0, reason: expect.stringContaining('no source citations') },
    ],
  })
  const [job] = await db.query<{ last_error: string }>('select last_error from city_interest_jobs')
  expect(job!.last_error).toContain('no source citations')
  expect(await count(db, 'notification_jobs')).toBe(0)
})

it('recovers expired claims but leaves active claims and old dates alone', async () => {
  const db = await createTestDb(),
    now = Date.parse('2026-10-01T16:00:00Z')
  await createUser(db, { cityKey: 'toronto' })
  await enqueueCityInterests(db, now)
  await db.query(
    "update city_interest_jobs set status = 'running', attempts = 1, lease_until = $1::timestamptz",
    [new Date(now + 600000).toISOString()],
  )
  const search = vi.fn<CitySearch>(async () => null)
  expect((await drainCityInterests(db, search, () => now)).claimed).toBe(0)
  expect((await drainCityInterests(db, search, () => now + 600001)).skipped).toBe(1)
  await db.query("update city_interest_jobs set status = 'pending', lease_until = null")
  expect((await drainCityInterests(db, search, () => now + 86400000)).claimed).toBe(0)
})
