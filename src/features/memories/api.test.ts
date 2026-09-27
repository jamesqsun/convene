import { beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '@/lib/db'
import { noParams } from '@/lib/http'
import { createTestDb, createUser } from '../../../supabase/tests/harness'
import type { SessionProvider } from '@/features/auth/session'
import { fakeAiProvider } from '@/features/ai/fake'
import { memoryRoutes } from './api'

let db: Db
let owner: string
let stranger: string

beforeAll(async () => {
  db = await createTestDb()
  owner = await createUser(db, { interests: ['coffee', 'hiking'] })
  stranger = await createUser(db)
  await db.query('update profiles set onboarding_answers = $2::jsonb where id = $1', [
    owner,
    JSON.stringify([
      { promptId: 'weekend', text: 'A long hike, then coffee somewhere quiet and unhurried.' },
    ]),
  ])
})

function stubProvider(id: string | null): SessionProvider {
  return {
    kind: 'demo',
    signUp: async () => ({ userId: '', isEmailConfirmationPending: false }),
    signIn: async () => '',
    startGoogleSignIn: async () => '',
    completeGoogleSignIn: async () => '',
    signOut: async () => undefined,
    userIdFrom: async () => id,
  }
}

const routesFor = (id: string | null) =>
  memoryRoutes({
    getProvider: async () => stubProvider(id),
    getDatabase: async () => db,
    getAi: fakeAiProvider,
  })

function request(method: string, path: string, body?: unknown): Request {
  return new Request(`http://localhost:3000${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
      host: 'localhost:3000',
      origin: 'http://localhost:3000',
    },
  })
}

const withId = (id: string) => ({ params: Promise.resolve({ id }) })

describe('memory routes', () => {
  it('generates, lists, edits, and deletes for the owner only', async () => {
    const routes = routesFor(owner)
    const generated = (await (
      await routes.generate(request('POST', '/api/memories/generate'), noParams)
    ).json()) as { status: string; memories: { id: string }[] }
    expect(generated.status).toBe('ok')
    const [memory] = generated.memories
    const listed = (await (
      await routes.list(request('GET', '/api/memories'), noParams)
    ).json()) as { memories: unknown[] }
    expect(listed.memories).toHaveLength(generated.memories.length)

    const foreign = routesFor(stranger)
    expect(
      (
        await foreign.update(
          request('PATCH', `/api/memories/${memory!.id}`, { topic: 'x' }),
          withId(memory!.id),
        )
      ).status,
    ).toBe(404)
    expect(
      (await foreign.remove(request('DELETE', `/api/memories/${memory!.id}`), withId(memory!.id)))
        .status,
    ).toBe(404)
    expect((await foreign.list(request('GET', '/api/memories'), noParams)).status).toBe(200)
    expect(
      (
        (await (await foreign.list(request('GET', '/api/memories'), noParams)).json()) as {
          memories: unknown[]
        }
      ).memories,
    ).toEqual([])

    expect(
      (
        await routes.update(
          request('PATCH', `/api/memories/${memory!.id}`, { weight: 1 }),
          withId(memory!.id),
        )
      ).status,
    ).toBe(400)
    const edited = (await (
      await routes.update(
        request('PATCH', `/api/memories/${memory!.id}`, {
          topic: 'Quiet cafes',
          attributes: { setting: 'quiet' },
        }),
        withId(memory!.id),
      )
    ).json()) as { memory: { topic: string; editedAt: number | null } }
    expect(edited.memory.topic).toBe('Quiet cafes')
    expect(edited.memory.editedAt).not.toBeNull()
    const profile = await db.query<{ embedding_stale: boolean }>(
      'select embedding_stale from profiles where id = $1',
      [owner],
    )
    expect(profile[0]!.embedding_stale).toBe(false)

    expect(
      (await routes.remove(request('DELETE', `/api/memories/${memory!.id}`), withId(memory!.id)))
        .status,
    ).toBe(204)
    expect(
      (await routes.remove(request('DELETE', `/api/memories/${memory!.id}`), withId(memory!.id)))
        .status,
    ).toBe(404)
    expect(
      (await routes.remove(request('DELETE', '/api/memories/not-a-uuid'), withId('not-a-uuid')))
        .status,
    ).toBe(404)
  })

  it('requires a session', async () => {
    expect((await routesFor(null).list(request('GET', '/api/memories'), noParams)).status).toBe(401)
    expect(
      (await routesFor(null).generate(request('POST', '/api/memories/generate'), noParams)).status,
    ).toBe(401)
  })
})
