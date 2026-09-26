import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Db } from '@/lib/db'
import { createTestDb, createUser } from '../../../supabase/tests/harness'
import { fakeAiProvider } from '@/features/openai/fake'
import type { AiProvider } from '@/features/openai/provider'
import { generateMemories } from './generate'
import { listMemories } from './store'

let db: Db
const answers = [
  { promptId: 'weekend', text: 'A long hike, then coffee somewhere quiet and unhurried.' },
  { promptId: 'meeting_people', text: 'Small groups and a shared activity make it easy to talk.' },
  { promptId: 'try_new', text: 'Bouldering, as long as nobody expects me to be good at it.' },
]

beforeAll(async () => {
  db = await createTestDb()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

async function userWithAnswers(): Promise<string> {
  const userId = await createUser(db, { interests: ['coffee', 'hiking', 'climbing'] })
  await db.query('update profiles set onboarding_answers = $2::jsonb where id = $1', [
    userId,
    JSON.stringify(answers),
  ])
  return userId
}

describe('generateMemories', () => {
  it('stores validated memories with embeddings and refreshes the profile', async () => {
    const userId = await userWithAnswers()
    const result = await generateMemories(db, fakeAiProvider(), userId)
    expect(result.status).toBe('ok')
    expect(result.memories).toHaveLength(3)
    expect(result.memories.map((m) => m.topic)).toContain('coffee')
    expect(result.memories.every((m) => m.evidence.length > 0)).toBe(true)
    const stale = await db.query<{ n: number }>(
      'select count(*)::int as n from preference_memories where user_id = $1 and (embedding is null or embedding_stale)',
      [userId],
    )
    expect(stale[0]!.n).toBe(0)
    const profile = await db.query<{ embedding_stale: boolean; has: boolean }>(
      'select embedding_stale, profile_embedding is not null as has from profiles where id = $1',
      [userId],
    )
    expect(profile[0]).toEqual({ embedding_stale: false, has: true })
  })

  it('drops memories whose evidence is not verbatim', async () => {
    const userId = await userWithAnswers()
    const inventive: AiProvider = {
      ...fakeAiProvider(),
      extractMemories: async () => ({
        memories: [
          { topic: 'real', summary: 's', evidence: ['long hike'], attributes: [], confidence: 0.5 },
          {
            topic: 'invented',
            summary: 's',
            evidence: ['loves skydiving'],
            attributes: [],
            confidence: 0.9,
          },
        ],
      }),
    }
    const result = await generateMemories(db, inventive, userId)
    expect(result.memories.map((m) => m.topic)).toEqual(['real'])
  })

  it('keeps answers and existing memories when the provider fails, and refuses without answers', async () => {
    const userId = await userWithAnswers()
    await generateMemories(db, fakeAiProvider(), userId)
    const before = await listMemories(db, userId)
    const broken: AiProvider = {
      ...fakeAiProvider(),
      extractMemories: async () => {
        throw new Error('rate limited')
      },
    }
    const result = await generateMemories(db, broken, userId)
    expect(result.status).toBe('failed')
    expect(result.notice).toMatch(/saved your answers/)
    expect(await listMemories(db, userId)).toEqual(before)
    const blank = await createUser(db)
    expect((await generateMemories(db, fakeAiProvider(), blank)).status).toBe('failed')
  })
})
