import { beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '@/lib/db'
import { bookGroup, createSlot, createTestDb, createUser } from '../../../supabase/tests/harness'
import { loadState } from './read'

let db: Db

beforeAll(async () => {
  db = await createTestDb()
})

describe('loadState', () => {
  it('assembles profile, slots with derived state, plans, and hangouts', async () => {
    const me = await createUser(db, { name: 'Maya' })
    const other = await createUser(db)
    await createSlot(db, me, '2026-10-10T22:00:00Z', '2026-10-11T00:00:00Z')
    const { eventId } = await bookGroup(db, {
      localDate: '2026-10-03',
      startIso: '2026-10-03T22:00:00Z',
      endIso: '2026-10-03T23:00:00Z',
      nowIso: '2026-10-01T00:00:00Z',
      users: [me, other],
    })
    const state = await loadState(db, me, Date.parse('2026-10-01T12:00:00Z'))
    expect(state.profile).toMatchObject({
      userId: me,
      name: 'Maya',
      onboardingStep: 'done',
      timezone: 'America/Toronto',
      cityLabel: 'Toronto',
      memoryCount: 0,
    })
    expect(state.slots.map((s) => s.state).sort()).toEqual(['assigned', 'waiting'])
    expect(state.plans.map((p) => p.eventId)).toEqual([eventId])
    expect(state.hangouts).toEqual([])
    await expect(loadState(db, '00000000-0000-0000-0000-000000000000', 0)).rejects.toMatchObject({
      status: 404,
    })
  })
})
