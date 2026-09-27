import type { Db } from '@/lib/db'

/**
 * The viewer's personal friend graph: every mutual friend they have shared a completed hangout
 * with (as non-withdrawn participants), with how recently they last met. Co-participants without
 * a friendship are left out. Rows are always (viewer, other); relationships between two other
 * people are never returned.
 */
export interface GraphNode {
  userId: string
  name: string
  interests: string[]
  meetings: number
  lastMetAt: number
}

interface GraphRow {
  user_id: string
  name: string
  interests: string[]
  meetings: number
  last_met_at: Date
}

export async function loadGraph(db: Db, userId: string, now: number): Promise<GraphNode[]> {
  const rows = await db.query<GraphRow>(
    `select o.user_id, p.name, p.interests, count(*)::int as meetings, max(e.ends_at) as last_met_at
     from event_participants me
     join events e on e.id = me.event_id and e.status = 'scheduled' and e.ends_at <= $2::timestamptz
     join event_participants o on o.event_id = e.id and o.user_id <> me.user_id and o.withdrawn_at is null
     join friendships f on f.user_a = least($1::uuid, o.user_id) and f.user_b = greatest($1::uuid, o.user_id)
     join profiles p on p.id = o.user_id
     where me.user_id = $1 and me.withdrawn_at is null
     group by o.user_id, p.name, p.interests
     order by max(e.ends_at) desc, p.name`,
    [userId, new Date(now).toISOString()],
  )
  return rows.map((row) => ({
    userId: row.user_id,
    name: row.name,
    interests: row.interests,
    meetings: row.meetings,
    lastMetAt: row.last_met_at.getTime(),
  }))
}
