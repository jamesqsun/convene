import { expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createTestDb, createUser, count } from '../../../supabase/tests/harness'
import { fakeAiProvider } from '@/features/ai/fake'
import { listMemories, replaceMemories } from '@/features/memories/store'
import { answerInterest, broadcastInterest, listInterestPrompts } from './store'
import { drainInterestMemories, interestMemory } from './jobs'

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
  expect((await listMemories(db, a))[0]!.summary).toContain('Yes (interested)')
  expect((await listMemories(db, b))[0]!.summary).toContain('No (not interested)')
  expect((await listMemories(db, b))[0]!.attributes.scope).toBe('this topic only')
  expect((await listInterestPrompts(db, a, now, id))[0]!.memoriesUpdated).toBe(true)
  await replaceMemories(db, a, [], [])
  expect((await listMemories(db, a))[0]!.source).toBe('interest_prompt')
  expect((await drainInterestMemories(db, ai, () => now)).claimed).toBe(0)
  expect(interestMemory('x'.repeat(400), 'no').summary.length).toBeLessThanOrEqual(500)
})
