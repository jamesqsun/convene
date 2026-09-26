import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { createTestDb, createUser } from '../tests/harness'
import { replaceMemories } from '@/features/memories/store'

describe('Gemini embedding migration', () => {
  it('clears incompatible vectors while retaining users and memories', async () => {
    const db = await createTestDb()
    const id = await createUser(db)
    const vector = Array(1536).fill(0.1)
    await replaceMemories(
      db,
      id,
      [
        {
          topic: 'coffee',
          summary: 'Quiet cafes',
          attributes: [],
          evidence: ['Quiet cafes'],
          confidence: 0.8,
        },
      ],
      [vector],
    )
    await db.query('update profiles set profile_embedding = $1::vector, embedding_stale = false', [
      JSON.stringify(vector),
    ])
    await db.exec(await readFile('supabase/migrations/0012_gemini_embeddings.sql', 'utf8'))
    expect(
      await db.query('select embedding, embedding_stale, topic from preference_memories'),
    ).toEqual([{ embedding: null, embedding_stale: true, topic: 'coffee' }])
    expect(await db.query('select id, profile_embedding, embedding_stale from profiles')).toEqual([
      { id, profile_embedding: null, embedding_stale: true },
    ])
  })
})
