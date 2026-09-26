import { beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '@/lib/db'
import { backdateEvent, bookGroup, createTestDb, createUser } from '../../../supabase/tests/harness'
import { submitFeedback } from './store'

let db: Db

beforeAll(async () => {
  db = await createTestDb()
})

describe('submitFeedback', () => {
  it('records answers, reports mutual friendship, and maps errors', async () => {
    const [a, b, c] = [await createUser(db), await createUser(db), await createUser(db)]
    const { eventId } = await bookGroup(db, {
      localDate: '2026-10-03',
      startIso: '2026-10-03T22:00:00Z',
      endIso: '2026-10-03T23:00:00Z',
      nowIso: '2026-10-01T00:00:00Z',
      users: [a, b, c],
    })
    const during = Date.parse('2026-10-03T22:30:00Z')
    await expect(
      submitFeedback(db, a, { eventId, subjectUserId: b, answer: 'yes' }, during),
    ).rejects.toMatchObject({ status: 409, code: 'not_completed' })
    await backdateEvent(db, eventId, '2026-10-03T23:00:00Z')
    const after = Date.parse('2026-10-04T12:00:00Z')
    expect(
      await submitFeedback(db, a, { eventId, subjectUserId: b, answer: 'yes' }, after),
    ).toEqual({ answer: 'yes', isMutualFriend: false })
    expect(
      await submitFeedback(db, b, { eventId, subjectUserId: a, answer: 'yes' }, after),
    ).toEqual({ answer: 'yes', isMutualFriend: true })
    await expect(
      submitFeedback(db, a, { eventId, subjectUserId: b, answer: 'no' }, after),
    ).rejects.toMatchObject({ code: 'answer_final' })
    await expect(
      submitFeedback(db, a, { eventId, subjectUserId: a, answer: 'yes' }, after),
    ).rejects.toMatchObject({ status: 422 })
    await expect(
      submitFeedback(db, await createUser(db), { eventId, subjectUserId: a, answer: 'yes' }, after),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      submitFeedback(
        db,
        a,
        { eventId: '00000000-0000-0000-0000-000000000000', subjectUserId: b, answer: 'yes' },
        after,
      ),
    ).rejects.toMatchObject({ status: 404 })
  })
})
