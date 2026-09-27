import { expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createTestDb, createUser, count } from '../../../supabase/tests/harness'
import { fakeAiProvider } from '@/features/ai/fake'
import { listMemories, replaceMemories } from '@/features/memories/store'
import { answerInterest, broadcastInterest, listInterestPrompts } from './store'
import { drainInterestMemories } from './jobs'

it('embeds each private answer once and retries failures without losing the answer', async () => {
  const db = await createTestDb(),
    a = await createUser(db),
    b = await createUser(db)
  for (const user of [a, b])
    await db.query(
      "insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, 'k', 'a')",
      [user, `https://push/${user}`],
    )
  let now = Date.now()
  const id = randomUUID(),
    text = 'Barcelona won the champions league',
    ai = fakeAiProvider()
  const extract = vi.spyOn(ai, 'extractMemories').mockImplementation(async ({ answers }) => ({
    memories: [
      {
        topic: 'Champions League football',
        summary: answers[0]!.text.includes('not interested')
          ? 'Not interested in this Champions League result.'
          : 'Interested in Champions League results involving Barcelona.',
        evidence: [answers[0]!.text],
        attributes: [
          { key: 'interest', value: answers[0]!.text.includes('not interested') ? 'no' : 'yes' },
        ],
        confidence: 0.6,
      },
    ],
  }))
  await broadcastInterest(db, id, text, now)
  await answerInterest(db, a, id, 'yes', now)
  await answerInterest(db, b, id, 'no', now)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const broken = {
    ...ai,
    embed: async () => {
      throw new Error('offline')
    },
  }
  expect((await drainInterestMemories(db, broken, () => now)).updated).toBe(0)
  expect(await count(db, 'preference_memories')).toBe(0)
  expect((await listInterestPrompts(db, a, now, id))[0]!.answer).toBe('yes')
  expect((await drainInterestMemories(db, ai, () => now)).claimed).toBe(0)
  now += 120001
  await Promise.all([
    drainInterestMemories(db, ai, () => now),
    drainInterestMemories(db, ai, () => now),
  ])
  expect(await count(db, 'preference_memories')).toBe(2)
  expect((await listMemories(db, a))[0]!).toMatchObject({
    topic: 'Champions League football',
    summary: 'Interested in Champions League results involving Barcelona.',
  })
  expect((await listMemories(db, b))[0]!.summary).toContain('Not interested')
  expect((await listMemories(db, b))[0]!.attributes.interest).toBe('no')
  expect(extract).toHaveBeenCalledWith({
    interests: [],
    answers: [
      {
        prompt: expect.stringContaining('Keep inference narrow'),
        text: `I am interested in this topic: ${text}`,
      },
    ],
  })
  expect((await listInterestPrompts(db, a, now, id))[0]!.memoriesUpdated).toBe(true)
  await replaceMemories(db, a, [], [])
  expect((await listMemories(db, a))[0]!.source).toBe('interest_prompt')
  expect((await drainInterestMemories(db, ai, () => now)).claimed).toBe(0)
})

it('drops unsupported extraction without inventing a fallback memory', async () => {
  const db = await createTestDb(),
    userId = await createUser(db),
    id = randomUUID(),
    now = Date.now()
  await db.query(
    "insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://push/evidence', 'k', 'a')",
    [userId],
  )
  await broadcastInterest(db, id, 'An upcoming concert', now)
  await answerInterest(db, userId, id, 'no', now)
  const ai = fakeAiProvider()
  vi.spyOn(ai, 'extractMemories').mockResolvedValue({
    memories: [
      {
        topic: 'Music',
        summary: 'Loves music',
        evidence: ['I love music'],
        attributes: [],
        confidence: 0.9,
      },
    ],
  })
  const embed = vi.spyOn(ai, 'embed')
  expect((await drainInterestMemories(db, ai, () => now)).updated).toBe(1)
  expect(await listMemories(db, userId)).toEqual([])
  expect(embed).not.toHaveBeenCalled()
})
