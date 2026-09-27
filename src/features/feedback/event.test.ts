import { expect, it, vi } from 'vitest'
import { fakeAiProvider } from '@/features/ai/fake'
import { listMemories, replaceMemories } from '@/features/memories/store'
import { loadHangouts } from '@/features/events/read'
import { asRole, bookGroup, count, createTestDb, createUser } from '../../../supabase/tests/harness'
import { loadProfiles } from '@/features/planning/batch/batches'
import { submitEventFeedback } from './event'

it('keeps feedback private, preserves existing memories, retries failures, and applies memories once', async () => {
  const db = await createTestDb()
  const a = await createUser(db)
  const b = await createUser(db)
  const outsider = await createUser(db)
  const { eventId } = await bookGroup(db, {
    localDate: '2026-10-03',
    startIso: '2026-10-03T18:00:00Z',
    endIso: '2026-10-03T19:00:00Z',
    nowIso: '2026-10-01T00:00:00Z',
    users: [a, b],
  })
  const ai = fakeAiProvider()
  const now = Date.parse('2026-10-04T00:00:00Z')
  const input = { eventId, text: 'I prefer quiet cafes where I can hear everyone speak.' }
  await expect(submitEventFeedback(db, ai, outsider, input, now)).rejects.toMatchObject({
    status: 404,
  })
  await expect(submitEventFeedback(db, ai, a, input, now - 86400000)).rejects.toMatchObject({
    status: 409,
  })
  const existing = {
    topic: 'walks',
    summary: 'I like walking.',
    evidence: ['I like walking.'],
    confidence: 0.7,
    attributes: [],
  }
  await replaceMemories(db, a, [existing], await ai.embed(['I like walking.']))
  const originalId = (await listMemories(db, a))[0]!.id
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const failed = await submitEventFeedback(
    db,
    {
      ...ai,
      embed: async () => {
        throw new Error('offline')
      },
    },
    a,
    input,
    now,
  )
  expect(failed.feedback.memoriesUpdated).toBe(false)
  expect(await count(db, 'event_feedback')).toBe(1)
  expect(await count(db, 'preference_memories')).toBe(1)
  expect((await loadHangouts(db, b, now))[0]!.myEventFeedback).toBeNull()
  const [result] = await Promise.all([
    submitEventFeedback(db, ai, a, input, now),
    submitEventFeedback(db, ai, a, input, now),
  ])
  expect(result.feedback.memoriesUpdated).toBe(true)
  const memories = await listMemories(db, a)
  expect(memories.some((memory) => memory.id === originalId)).toBe(true)
  expect(memories.find((memory) => memory.source === 'event_feedback')?.evidence).toEqual([
    input.text,
  ])
  expect(await listMemories(db, b)).toEqual([])
  expect(
    (await loadProfiles(db, [a])).get(a)?.memories.some((memory) => memory.summary === input.text),
  ).toBe(true)
  await db.exec('grant select on event_feedback to anon, authenticated')
  for (const role of ['anon', 'authenticated'] as const)
    expect(await asRole(db, role, (tx) => tx.query('select * from event_feedback'))).toEqual([])
  expect((await loadHangouts(db, a, now))[0]!.myEventFeedback).toMatchObject(result.feedback)
  expect(
    (
      await db.query<{ embedding_stale: boolean; profile_embedding: unknown }>(
        'select embedding_stale, profile_embedding from profiles where id = $1',
        [a],
      )
    )[0],
  ).toMatchObject({ embedding_stale: false, profile_embedding: expect.anything() })
  await submitEventFeedback(db, ai, a, input, now)
  expect(await count(db, 'preference_memories')).toBe(2)
  await expect(
    submitEventFeedback(db, ai, a, { ...input, text: 'different' }, now),
  ).rejects.toMatchObject({ status: 409 })
  await replaceMemories(db, a, [], [])
  expect((await listMemories(db, a))[0]?.source).toBe('event_feedback')
  await db.query(
    'update event_participants set withdrawn_at = now() where event_id = $1 and user_id = $2',
    [eventId, b],
  )
  await expect(submitEventFeedback(db, ai, b, input, now)).rejects.toMatchObject({ status: 404 })
  await db.query(
    'update event_participants set withdrawn_at = null where event_id = $1 and user_id = $2',
    [eventId, b],
  )
  await db.query("update events set status = 'cancelled' where id = $1", [eventId])
  await expect(submitEventFeedback(db, ai, b, input, now)).rejects.toMatchObject({ status: 409 })
})

it('drops unsupported model claims and rolls back invalid embeddings without losing the feedback', async () => {
  const db = await createTestDb()
  const a = await createUser(db),
    b = await createUser(db)
  const { eventId } = await bookGroup(db, {
    localDate: '2026-10-03',
    startIso: '2026-10-03T18:00:00Z',
    endIso: '2026-10-03T19:00:00Z',
    nowIso: '2026-10-01T00:00:00Z',
    users: [a, b],
  })
  const ai = fakeAiProvider(),
    now = Date.parse('2026-10-04T00:00:00Z')
  const input = { eventId, text: 'I really enjoyed the quiet atmosphere.' }
  const extraction = await ai.extractMemories({
    interests: [],
    answers: [{ prompt: 'event', text: input.text }],
  })
  const unsupported = { ...extraction.memories[0]!, evidence: ['invented evidence'] }
  await submitEventFeedback(
    db,
    { ...ai, extractMemories: async () => ({ memories: [unsupported] }) },
    a,
    input,
    now,
  )
  expect(await count(db, 'preference_memories')).toBe(0)
  const failed = await submitEventFeedback(
    db,
    { ...ai, embed: async () => [[1, 2]] },
    b,
    input,
    now,
  )
  expect(failed.feedback.memoriesUpdated).toBe(false)
  expect(await count(db, 'preference_memories')).toBe(0)
})
