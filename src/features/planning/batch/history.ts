import type { Db } from '@/lib/db'
import { type HistorySnapshot, pairKey } from '../buckets/reconnection'
import type { UserId } from '../types'

interface FriendshipRow {
  user_a: string
  user_b: string
  created_at: Date
}

interface LatestEventRow {
  user_a: string
  user_b: string
  event_id: string
  ends_at: Date
  yes_count: number
}

/**
 * Freezes everything reconnection scoring needs for one planning pass: feedback-established
 * friendships among the people in play and, per pair, their latest completed shared hangout with
 * whether both answered yes about each other for it. Only events that ended by the scoring time
 * count, and only participants who did not withdraw.
 */
export async function loadHistorySnapshot(
  db: Db,
  userIds: readonly UserId[],
  scoringTime: number,
): Promise<HistorySnapshot> {
  const snapshot: HistorySnapshot = { scoringTime, friendships: {}, history: {} }
  if (userIds.length < 2) return snapshot
  const ids = [...userIds]
  const scoringIso = new Date(scoringTime).toISOString()

  const friendships = await db.query<FriendshipRow>(
    'select user_a, user_b, created_at from friendships where user_a = any($1::uuid[]) and user_b = any($1::uuid[])',
    [ids],
  )
  for (const row of friendships) {
    snapshot.friendships[pairKey(row.user_a, row.user_b)] = { createdAt: row.created_at.getTime() }
  }

  const latest = await db.query<LatestEventRow>(
    `select f.user_a, f.user_b, e.id as event_id, e.ends_at,
       (select count(*)::int from participant_feedback pf
         where pf.event_id = e.id and pf.meet_again
           and ((pf.author_id = f.user_a and pf.subject_id = f.user_b)
             or (pf.author_id = f.user_b and pf.subject_id = f.user_a))) as yes_count
     from friendships f
     join lateral (
       select e.id, e.ends_at from events e
       join event_participants pa on pa.event_id = e.id and pa.user_id = f.user_a and pa.withdrawn_at is null
       join event_participants pb on pb.event_id = e.id and pb.user_id = f.user_b and pb.withdrawn_at is null
       where e.status = 'scheduled' and e.ends_at <= $2::timestamptz
       order by e.ends_at desc, e.id desc
       limit 1
     ) e on true
     where f.user_a = any($1::uuid[]) and f.user_b = any($1::uuid[])`,
    [ids, scoringIso],
  )
  for (const row of latest) {
    snapshot.history[pairKey(row.user_a, row.user_b)] = {
      latestEventId: row.event_id,
      latestEventEnd: row.ends_at.getTime(),
      isMutualYesOnLatest: row.yes_count === 2,
    }
  }
  return snapshot
}
