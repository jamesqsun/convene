import { beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '@/lib/db'
import { createTestDb, createUser } from '../../../supabase/tests/harness'
import { applyProfilePatch, loadProfile } from './store'

let db: Db
const toronto = {
  key: 'ca:ontario:toronto',
  label: 'Toronto, Ontario, Canada',
  name: 'Toronto',
  timezone: 'America/Toronto',
  lat: 43.7,
  lng: -79.4,
}
const answers = [
  { promptId: 'weekend' as const, text: 'A long hike, then coffee somewhere quiet and unhurried.' },
  {
    promptId: 'meeting_people' as const,
    text: 'Small groups and a shared activity make it easy to talk.',
  },
  {
    promptId: 'try_new' as const,
    text: 'Bouldering, as long as nobody expects me to be good at it.',
  },
]

beforeAll(async () => {
  db = await createTestDb()
})

describe('applyProfilePatch', () => {
  it('saves step by step and completes onboarding when everything is present', async () => {
    const userId = await createUser(db, { isOnboarded: false })
    await db.query(
      "update profiles set name = '', age = null, city_key = null, city_timezone = null, city_name = null, phone_e164 = null, interests = '{}' where id = $1",
      [userId],
    )
    let profile = await applyProfilePatch(db, userId, { name: 'Maya', age: 29 })
    expect(profile).toMatchObject({
      name: 'Maya',
      age: 29,
      city: null,
      onboardingCompletedAt: null,
    })
    profile = await applyProfilePatch(db, userId, { city: toronto })
    expect(profile.city).toEqual({
      key: toronto.key,
      name: 'Toronto',
      timezone: 'America/Toronto',
      lat: 43.7,
      lng: -79.4,
    })
    profile = await applyProfilePatch(db, userId, {
      phone: '+14165550100',
      interests: ['coffee', 'hiking'],
    })
    expect(profile.onboardingCompletedAt).toBeNull()
    profile = await applyProfilePatch(db, userId, { answers })
    expect(profile.answers).toEqual(answers)
    expect(profile.onboardingCompletedAt).not.toBeNull()
    expect(profile.memoryCount).toBe(0)
  })

  it('leaves untouched fields alone and returns null for unknown users', async () => {
    const userId = await createUser(db)
    const before = (await loadProfile(db, userId))!
    const after = await applyProfilePatch(db, userId, { name: 'Renamed' })
    expect(after).toEqual({ ...before, name: 'Renamed' })
    expect(await loadProfile(db, '00000000-0000-0000-0000-000000000000')).toBeNull()
  })
})
