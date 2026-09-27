import { describe, expect, it } from 'vitest'
import { replaceMemories } from '@/features/memories/store'
import type { Db } from '@/lib/db'
import { createTestDb, createUser } from '../tests/harness'

async function createUserWithMemory(db: Db): Promise<string> {
  const id = await createUser(db)
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
    [Array(1536).fill(0.1)],
  )
  return id
}

async function deleteAsAuthService(db: Db, id: string): Promise<void> {
  await db.exec('set search_path = auth')
  try {
    await db.query('delete from auth.users where id = $1', [id])
  } finally {
    await db.exec('set search_path = public')
  }
}

describe('memory trigger search path migration', () => {
  it('lets the auth service delete a user who has memories', async () => {
    const db = await createTestDb()
    const id = await createUserWithMemory(db)

    await deleteAsAuthService(db, id)

    expect(await db.query('select 1 from public.profiles where id = $1', [id])).toEqual([])
    expect(await db.query('select 1 from public.preference_memories')).toEqual([])
  })

  it('is what makes that deletion possible', async () => {
    const db = await createTestDb()
    const id = await createUserWithMemory(db)
    await db.exec('alter function public.mark_profile_embedding_stale() reset search_path')

    await expect(deleteAsAuthService(db, id)).rejects.toThrow(/relation "profiles" does not exist/)
  })

  it('still marks the profile stale when a memory changes', async () => {
    const db = await createTestDb()
    const id = await createUserWithMemory(db)
    await db.query('update profiles set embedding_stale = false where id = $1', [id])

    await db.query('delete from preference_memories where user_id = $1', [id])

    expect(await db.query('select embedding_stale from profiles where id = $1', [id])).toEqual([
      { embedding_stale: true },
    ])
  })
})
