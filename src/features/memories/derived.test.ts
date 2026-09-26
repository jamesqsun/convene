import { beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '@/lib/db'
import { createTestDb, createUser } from '../../../supabase/tests/harness'
import { fakeAiProvider, hashedEmbedding } from '@/features/openai/fake'
import { cosine } from '@/features/planning/groups/similarity'
import { meanUnitVector, refreshDerived } from './derived'
import { listMemoryEmbeddings, replaceMemories, updateMemory, listMemories } from './store'

let db: Db

beforeAll(async () => {
  db = await createTestDb()
})

async function profileState(
  userId: string,
): Promise<{ embedding: number[] | null; isStale: boolean }> {
  const rows = await db.query<{ embedding: string | null; embedding_stale: boolean }>(
    'select profile_embedding::text as embedding, embedding_stale from profiles where id = $1',
    [userId],
  )
  return {
    embedding: rows[0]!.embedding ? (JSON.parse(rows[0]!.embedding) as number[]) : null,
    isStale: rows[0]!.embedding_stale,
  }
}

describe('refreshDerived', () => {
  it('embeds stale memories and sets the profile embedding to their normalized mean', async () => {
    const userId = await createUser(db)
    const drafts = [
      {
        topic: 'coffee',
        summary: 'Likes quiet cafes.',
        evidence: ['e'],
        attributes: [],
        confidence: 0.5,
      },
      {
        topic: 'hiking',
        summary: 'Easy trails.',
        evidence: ['e'],
        attributes: [],
        confidence: 0.5,
      },
    ]
    await replaceMemories(db, userId, drafts, [])
    await refreshDerived(db, fakeAiProvider(), userId)
    const embeddings = await listMemoryEmbeddings(db, userId)
    expect(embeddings).toHaveLength(2)
    expect(cosine(embeddings[0]!, hashedEmbedding('coffee. Likes quiet cafes.'))).toBeCloseTo(1)
    const profile = await profileState(userId)
    expect(profile.isStale).toBe(false)
    expect(cosine(profile.embedding!, meanUnitVector(embeddings)!)).toBeCloseTo(1)
  })

  it('re-embeds after an edit and clears the profile embedding when memories are gone', async () => {
    const userId = await createUser(db)
    await replaceMemories(
      db,
      userId,
      [
        {
          topic: 'coffee',
          summary: 'Likes cafes.',
          evidence: ['e'],
          attributes: [],
          confidence: 0.5,
        },
      ],
      [hashedEmbedding('x')],
    )
    const [memory] = await listMemories(db, userId)
    await updateMemory(db, userId, memory!.id, { summary: 'Prefers tea houses.' })
    expect((await profileState(userId)).isStale).toBe(true)
    await refreshDerived(db, fakeAiProvider(), userId)
    const [embedding] = await listMemoryEmbeddings(db, userId)
    expect(cosine(embedding!, hashedEmbedding('coffee. Prefers tea houses.'))).toBeCloseTo(1)
    await db.query('delete from preference_memories where user_id = $1', [userId])
    await refreshDerived(db, fakeAiProvider(), userId)
    expect(await profileState(userId)).toEqual({ embedding: null, isStale: false })
  })

  it('averages vectors onto the unit sphere', () => {
    expect(meanUnitVector([])).toBeNull()
    expect(
      meanUnitVector([
        [1, 0],
        [0, 1],
      ])!.map((v) => Number(v.toFixed(4))),
    ).toEqual([0.7071, 0.7071])
    expect(
      meanUnitVector([
        [1, 0],
        [-1, 0],
      ]),
    ).toEqual([0, 0])
  })
})
