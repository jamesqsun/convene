import { randomUUID } from 'node:crypto'
import type { AiProvider } from '@/features/ai/provider'
import { meanUnitVector } from '@/features/memories/derived'
import { listMemoryEmbeddings, memoryText, storeProfileEmbedding } from '@/features/memories/store'
import type { Db } from '@/lib/db'

/** A yes/no is evidence about this exact topic, not a reason to infer broader likes/dislikes. */
export function interestMemory(text: string, answer: 'yes' | 'no') {
  const topic = 'Response to an interest prompt'
  const summary = `Answered ${answer === 'yes' ? 'Yes (interested)' : 'No (not interested)'} to: ${text}`
  return { topic, summary, attributes: { interest: answer, scope: 'this topic only' } }
}

export async function drainInterestMemories(
  db: Db,
  ai: AiProvider,
  clock: () => number,
  target?: { id: string; userId: string },
) {
  const now = clock(),
    claim = randomUUID()
  const rows = await db.query<{
    prompt_id: string
    user_id: string
    answer: 'yes' | 'no'
    attempts: number
    text: string
  }>(
    `with candidates as (
      select prompt_id, user_id from interest_responses where answer is not null and not memories_updated
      and attempts < 5 and next_attempt_at <= $1::timestamptz and (lease_until is null or lease_until < $1::timestamptz)
      and ($2::uuid is null or (prompt_id = $2 and user_id = $3))
      order by next_attempt_at limit 2 for update skip locked
    ), claimed as (
      update interest_responses r set attempts = attempts + 1, lease_until = $1::timestamptz + interval '10 minutes', claim_id = $4
      from candidates c where r.prompt_id = c.prompt_id and r.user_id = c.user_id returning r.*
    ) select c.prompt_id, c.user_id, c.answer, c.attempts, p.text from claimed c join interest_prompts p on p.id = c.prompt_id`,
    [new Date(now).toISOString(), target?.id ?? null, target?.userId ?? null, claim],
  )
  const outcomes = await Promise.all(
    rows.map(async (row) => {
      let updated = false
      try {
        const memory = interestMemory(row.text, row.answer)
        const [embedding] = await ai.embed([memoryText(memory)])
        if (!embedding) throw new Error('Missing embedding')
        await db.transaction(async (tx) => {
          await tx.query('select id from profiles where id = $1 for update', [row.user_id])
          const [current] = await tx.query<{ memories_updated: boolean; claim_id: string }>(
            'select memories_updated, claim_id from interest_responses where prompt_id = $1 and user_id = $2 for update',
            [row.prompt_id, row.user_id],
          )
          if (!current || current.memories_updated || current.claim_id !== claim) return
          await tx.query(
            `insert into preference_memories (user_id, topic, summary, evidence, attributes, confidence, source, embedding, embedding_stale)
          values ($1, $2, $3, $4, $5::jsonb, 0.7, 'interest_prompt', $6::vector, false)`,
            [
              row.user_id,
              memory.topic,
              memory.summary,
              [row.text, row.answer],
              JSON.stringify(memory.attributes),
              JSON.stringify(embedding),
            ],
          )
          const stale = await tx.query(
            'select id from preference_memories where user_id = $1 and embedding_stale',
            [row.user_id],
          )
          if (!stale.length)
            await storeProfileEmbedding(
              tx,
              row.user_id,
              meanUnitVector(await listMemoryEmbeddings(tx, row.user_id)),
            )
          await tx.query(
            'update interest_responses set memories_updated = true where prompt_id = $1 and user_id = $2',
            [row.prompt_id, row.user_id],
          )
          updated = true
        })
      } catch (error) {
        console.error('[interests] memory update failed:', error)
      }
      await db.query(
        `update interest_responses set lease_until = null, claim_id = null, next_attempt_at = $4::timestamptz
      where prompt_id = $1 and user_id = $2 and claim_id = $3`,
        [
          row.prompt_id,
          row.user_id,
          claim,
          new Date(clock() + 2 ** row.attempts * 60_000).toISOString(),
        ],
      )
      return updated
    }),
  )
  return { claimed: rows.length, updated: outcomes.filter(Boolean).length }
}
