import type { Db } from '@/lib/db'
import { HttpError } from '@/lib/http'
import type { FeedbackInput } from './schemas'

export interface FeedbackOutcome {
  answer: 'yes' | 'no'
  isMutualFriend: boolean
}

const errorMap: Record<string, [number, string, string]> = {
  event_not_found: [404, 'hangout_missing', 'Hangout not found'],
  not_participant: [403, 'not_participant', 'Only participants can answer about each other'],
  event_cancelled: [409, 'event_cancelled', 'This hangout was cancelled'],
  event_not_completed: [409, 'not_completed', 'You can answer once the hangout has ended'],
  self_feedback: [422, 'self_feedback', 'You cannot answer about yourself'],
  answer_final: [409, 'answer_final', 'Your answer for this person is final'],
}

/**
 * Records the answer through the feedback transaction and reports only the mutual outcome.
 * The other person's answer is never returned.
 */
export async function submitFeedback(
  db: Db,
  authorId: string,
  input: FeedbackInput,
  now: number,
): Promise<FeedbackOutcome> {
  try {
    await db.query('select submit_feedback($1, $2, $3, $4, $5::timestamptz)', [
      input.eventId,
      authorId,
      input.subjectUserId,
      input.answer === 'yes',
      new Date(now).toISOString(),
    ])
  } catch (error) {
    const code = error instanceof Error ? error.message.split('\n')[0]! : ''
    const mapped = errorMap[code]
    if (mapped) throw new HttpError(mapped[0], mapped[1], mapped[2])
    throw error
  }
  const rows = await db.query<{ is_friend: boolean }>(
    'select exists (select 1 from friendships where user_a = least($1::uuid, $2::uuid) and user_b = greatest($1::uuid, $2::uuid)) as is_friend',
    [authorId, input.subjectUserId],
  )
  return { answer: input.answer, isMutualFriend: rows[0]!.is_friend }
}
