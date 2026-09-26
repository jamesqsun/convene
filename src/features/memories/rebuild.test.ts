import { describe, expect, it } from 'vitest'
import { fakeAiProvider } from '@/features/ai/fake'
import { createTestDb, createUser } from '../../../supabase/tests/harness'
import { rebuildEmbeddings } from './rebuild'
import { listMemories, replaceMemories } from './store'

describe('rebuildEmbeddings', () => {
  it('preserves canonical memories, invalidates all old vectors before API calls, and recovers from failure', async () => {
    const db = await createTestDb()
    const users = [await createUser(db), await createUser(db)]
    const draft = {
      topic: 'coffee',
      summary: 'Quiet cafes.',
      attributes: [],
      evidence: ['Quiet cafes.'],
      confidence: 0.8,
    }
    for (const id of users) await replaceMemories(db, id, [draft], [Array(1536).fill(0.1)])
    const before = await listMemories(db, users[0]!)
    const fake = fakeAiProvider()
    await expect(
      rebuildEmbeddings(db, {
        ...fake,
        embed: async () => {
          expect(
            await db.query('select id from preference_memories where embedding is not null'),
          ).toEqual([])
          expect(
            await db.query('select id from profiles where profile_embedding is not null'),
          ).toEqual([])
          throw new Error('Gemini unavailable')
        },
      }),
    ).rejects.toThrow('Gemini unavailable')
    expect(await rebuildEmbeddings(db, fake)).toBe(2)
    expect(await listMemories(db, users[0]!)).toEqual(before)
    expect(await db.query('select id from preference_memories where embedding_stale')).toEqual([])
    expect(await db.query('select id from profiles where embedding_stale')).toEqual([])
  })
})
