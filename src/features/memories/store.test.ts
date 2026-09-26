import { beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '@/lib/db'
import { createTestDb, createUser } from '../../../supabase/tests/harness'
import { hashedEmbedding } from '@/features/openai/fake'
import {
  deleteMemory,
  listMemories,
  listStaleMemories,
  memoryText,
  replaceMemories,
  updateMemory,
} from './store'

let db: Db
const draft = (topic: string, confidence = 0.5) => ({
  topic,
  summary: `About ${topic}.`,
  evidence: [`likes ${topic}`],
  attributes: [{ key: 'setting', value: 'quiet' }],
  confidence,
})

beforeAll(async () => {
  db = await createTestDb()
})

describe('memory store', () => {
  it('replaces memories with embeddings and lists them by confidence', async () => {
    const userId = await createUser(db)
    await replaceMemories(
      db,
      userId,
      [draft('coffee', 0.4), draft('hiking', 0.9)],
      [hashedEmbedding('coffee'), hashedEmbedding('hiking')],
    )
    const memories = await listMemories(db, userId)
    expect(memories.map((m) => m.topic)).toEqual(['hiking', 'coffee'])
    expect(memories[0]).toMatchObject({
      attributes: { setting: 'quiet' },
      evidence: ['likes hiking'],
      source: 'onboarding',
      editedAt: null,
    })
    expect(await listStaleMemories(db, userId)).toEqual([])
    await replaceMemories(db, userId, [draft('art')], [])
    expect((await listMemories(db, userId)).map((m) => m.topic)).toEqual(['art'])
    expect(await listStaleMemories(db, userId)).toHaveLength(1)
  })

  it('edits only the owner’s memory, clears its embedding, and deletes owner-only', async () => {
    const owner = await createUser(db)
    const stranger = await createUser(db)
    await replaceMemories(db, owner, [draft('coffee')], [hashedEmbedding('coffee')])
    const [memory] = await listMemories(db, owner)
    expect(await updateMemory(db, stranger, memory!.id, { topic: 'Hijacked' })).toBeNull()
    const edited = await updateMemory(db, owner, memory!.id, {
      summary: 'Prefers tea.',
      attributes: { drink: 'tea' },
    })
    expect(edited).toMatchObject({
      topic: 'coffee',
      summary: 'Prefers tea.',
      attributes: { drink: 'tea' },
      evidence: ['likes coffee'],
    })
    expect(edited!.editedAt).not.toBeNull()
    expect(await listStaleMemories(db, owner)).toEqual([
      { id: memory!.id, text: 'coffee. Prefers tea. (drink: tea)' },
    ])
    expect(await deleteMemory(db, stranger, memory!.id)).toBe(false)
    expect(await deleteMemory(db, owner, memory!.id)).toBe(true)
    expect(await listMemories(db, owner)).toEqual([])
  })

  it('describes a memory for embedding without its evidence', () => {
    expect(memoryText({ topic: 'coffee', summary: 'Likes cafes.', attributes: {} })).toBe(
      'coffee. Likes cafes.',
    )
  })
})
