import type { Db } from '@/lib/db'
import { HttpError } from '@/lib/http'

export interface InterestPrompt {
  id: string
  text: string
  answer: 'yes' | 'no' | null
  memoriesUpdated: boolean
  failed: boolean
}

/** Snapshot distinct subscribers once. The caller supplies an idempotency UUID. */
export async function broadcastInterest(db: Db, id: string, text: string, now: number) {
  return db.transaction(async (tx) => {
    const inserted = await tx.query(
      'insert into interest_prompts (id, text) values ($1, $2) on conflict do nothing returning id',
      [id, text],
    )
    const [prompt] = await tx.query<{ text: string }>(
      'select text from interest_prompts where id = $1',
      [id],
    )
    if (prompt!.text !== text)
      throw new HttpError(409, 'request_conflict', 'This request ID was used for a different topic')
    if (inserted.length) {
      await tx.query(
        `insert into interest_responses (prompt_id, user_id)
        select $1, user_id from push_subscriptions where retired_at is null group by user_id`,
        [id],
      )
      await tx.query(
        `insert into notification_jobs (prompt_id, recipient_id, type, next_attempt_at)
        select prompt_id, user_id, 'interest_prompt', $2::timestamptz from interest_responses where prompt_id = $1`,
        [id, new Date(now).toISOString()],
      )
    }
    const [count] = await tx.query<{ recipients: number }>(
      'select count(*)::int as recipients from interest_responses where prompt_id = $1',
      [id],
    )
    return { promptId: id, recipients: count!.recipients }
  })
}

export async function listInterestPrompts(
  db: Db,
  userId: string,
  now: number,
  id?: string,
): Promise<InterestPrompt[]> {
  return db.query<InterestPrompt>(
    `select p.id, p.text, r.answer, r.memories_updated as "memoriesUpdated",
    (not r.memories_updated and r.attempts >= 5 and (r.lease_until is null or r.lease_until < $2::timestamptz)) as failed
    from interest_responses r join interest_prompts p on p.id = r.prompt_id
    where r.user_id = $1 and ($3::uuid is null or p.id = $3) order by p.created_at desc limit 50`,
    [userId, new Date(now).toISOString(), id ?? null],
  )
}

export async function answerInterest(
  db: Db,
  userId: string,
  id: string,
  answer: 'yes' | 'no',
  now: number,
) {
  await db.transaction(async (tx) => {
    const [existing] = await tx.query<{ answer: string | null }>(
      'select answer from interest_responses where prompt_id = $1 and user_id = $2 for update',
      [id, userId],
    )
    if (!existing) throw new HttpError(404, 'prompt_missing', 'Topic not found')
    if (existing.answer !== null && existing.answer !== answer)
      throw new HttpError(409, 'answer_final', 'You have already answered this topic')
    await tx.query(
      `update interest_responses set answer = $3, answered_at = coalesce(answered_at, $4::timestamptz),
      next_attempt_at = case when answer is null or (attempts >= 5 and (lease_until is null or lease_until < $4::timestamptz)) then $4::timestamptz else next_attempt_at end,
      attempts = case when attempts >= 5 and (lease_until is null or lease_until < $4::timestamptz) then 0 else attempts end
      where prompt_id = $1 and user_id = $2`,
      [id, userId, answer, new Date(now).toISOString()],
    )
  })
  return (await listInterestPrompts(db, userId, now, id))[0]!
}
