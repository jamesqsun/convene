import type { Db } from '@/lib/db'
import { HttpError } from '@/lib/http'

export type WithdrawResult =
  'withdrawn' | 'event_cancelled' | 'already_withdrawn' | 'already_cancelled'

const errorMap: Record<string, [number, string, string]> = {
  event_not_found: [404, 'plan_missing', 'Plan not found'],
  not_participant: [404, 'plan_missing', 'Plan not found'],
  event_started: [409, 'event_started', 'This plan has already started; attendance is assumed'],
}

/** Runs the withdraw transaction and translates its outcome codes into HTTP semantics. */
export async function withdrawFromEvent(
  db: Db,
  userId: string,
  eventId: string,
  now: number,
): Promise<{ result: WithdrawResult; remaining: number }> {
  let result: WithdrawResult
  try {
    const rows = await db.query<{ result: WithdrawResult }>(
      'select withdraw_participant($1, $2, $3::timestamptz) as result',
      [eventId, userId, new Date(now).toISOString()],
    )
    result = rows[0]!.result
  } catch (error) {
    const code = error instanceof Error ? error.message.split('\n')[0]! : ''
    const mapped = errorMap[code]
    if (mapped) throw new HttpError(mapped[0], mapped[1], mapped[2])
    throw error
  }
  const remaining = await db.query<{ n: number }>(
    'select count(*)::int as n from event_participants where event_id = $1 and withdrawn_at is null',
    [eventId],
  )
  return { result, remaining: remaining[0]!.n }
}
