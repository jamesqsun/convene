import type { Db } from '@/lib/db'
import { day, hour, localDateOf, zonedTime } from '@/lib/time'
import { seedFriendships, torontoKey } from './people'

/**
 * Two completed Toronto hangouts so the demo has friendships with real provenance:
 * H1, 20 days ago: Maya, Ben, Chloe. Maya and Ben both said yes (friends); Chloe said yes about
 * Maya but Maya said no about Chloe; Ben and Chloe never answered.
 * H2, 45 days ago: Maya and Dev, mutual yes (friends, and overdue for a reconnection bonus).
 */

const timezone = 'America/Toronto'
const h1EventId = '00000000-0000-4000-8000-00000000e001'
const h2EventId = '00000000-0000-4000-8000-00000000e002'

interface PastEvent {
  eventId: string
  daysAgo: number
  members: string[]
  activityId: string
  activityName: string
  venueName: string
  yes: [string, string][]
  no: [string, string][]
}

const pastEvents: PastEvent[] = [
  {
    eventId: h1EventId,
    daysAgo: 20,
    members: [seedFriendships.maya, seedFriendships.ben, seedFriendships.chloe],
    activityId: 'board_game_cafe',
    activityName: 'Board game cafe',
    venueName: '(Demo) Board game cafe on Main',
    yes: [
      [seedFriendships.maya, seedFriendships.ben],
      [seedFriendships.ben, seedFriendships.maya],
      [seedFriendships.chloe, seedFriendships.maya],
    ],
    no: [[seedFriendships.maya, seedFriendships.chloe]],
  },
  {
    eventId: h2EventId,
    daysAgo: 45,
    members: [seedFriendships.maya, seedFriendships.dev],
    activityId: 'park_walk',
    activityName: 'Walk in the park',
    venueName: '(Demo) Park on Main',
    yes: [
      [seedFriendships.maya, seedFriendships.dev],
      [seedFriendships.dev, seedFriendships.maya],
    ],
    no: [],
  },
]

async function insertPastEvent(db: Db, event: PastEvent, now: number): Promise<void> {
  const localDate = localDateOf(timezone, now - event.daysAgo * day)
  const start = zonedTime(timezone, localDate, 18)
  const end = start + 2 * hour
  const startIso = new Date(start).toISOString()
  const endIso = new Date(end).toISOString()
  const batch = await db.query<{ id: string }>(
    `insert into planning_batches (city_key, timezone, local_date, status, pass, attempts, scoring_time, finished_at)
     values ($1, $2, $3::date, 'done', 1, 1, $4::timestamptz, $4::timestamptz)
     on conflict (city_key, local_date) do update set updated_at = now() returning id`,
    [torontoKey, timezone, localDate, new Date(start - 2 * day).toISOString()],
  )
  const slotIds: Record<string, string> = {}
  for (const userId of event.members) {
    const slot = await db.query<{ id: string }>(
      `insert into availability_slots (user_id, "window", timezone, status, revision)
       values ($1, tstzrange($2::timestamptz, $3::timestamptz, '[)'), $4, 'pending', 1) returning id`,
      [userId, startIso, endIso, timezone],
    )
    slotIds[userId] = slot[0]!.id
  }
  const members = event.members.map((userId) => ({
    user_id: userId,
    slot_id: slotIds[userId],
    revision: 1,
  }))
  const planningId = `seed-${event.eventId}`
  await db.query(
    `insert into planning_proposals (planning_id, batch_id, pass, members, shared_start, shared_end, status)
     values ($1, $2, 1, $3::jsonb, $4::timestamptz, $5::timestamptz, 'committed')`,
    [planningId, batch[0]!.id, JSON.stringify(members), startIso, endIso],
  )
  await db.query(
    `insert into events (id, planning_id, city_key, timezone, local_date, activity_id, activity_name, duration_minutes, explanation, venue, starts_at, ends_at)
     values ($1, $2, $3, $4, $5::date, $6, $7, 120, 'You share an interest in coffee.', $8::jsonb, $9::timestamptz, $10::timestamptz)`,
    [
      event.eventId,
      planningId,
      torontoKey,
      timezone,
      localDate,
      event.activityId,
      event.activityName,
      JSON.stringify({
        provider: 'fictional',
        place_id: `demo:${event.activityId}`,
        name: event.venueName,
        address: '12 Main St, Toronto (fictional)',
        lat: 43.65,
        lng: -79.38,
        hours_verified: false,
      }),
      startIso,
      endIso,
    ],
  )
  await db.query('update planning_proposals set event_id = $2 where planning_id = $1', [
    planningId,
    event.eventId,
  ])
  for (const userId of event.members) {
    await db.query(
      'insert into event_participants (event_id, user_id, slot_id) values ($1, $2, $3)',
      [event.eventId, userId, slotIds[userId]],
    )
    await db.query(
      `insert into participant_reservations (event_id, user_id, "window") values ($1, $2, tstzrange($3::timestamptz, $4::timestamptz, '[)'))`,
      [event.eventId, userId, startIso, endIso],
    )
    await db.query(
      'insert into user_date_assignments (user_id, local_date, event_id) values ($1, $2::date, $3)',
      [userId, localDate, event.eventId],
    )
    await db.query(
      "update availability_slots set status = 'filled', assigned_event_id = $2, revision = 2 where id = $1",
      [slotIds[userId], event.eventId],
    )
  }
  const answeredAt = new Date(end + hour).toISOString()
  for (const [author, subject] of event.yes)
    await db.query('select submit_feedback($1, $2, $3, true, $4::timestamptz)', [
      event.eventId,
      author,
      subject,
      answeredAt,
    ])
  for (const [author, subject] of event.no)
    await db.query('select submit_feedback($1, $2, $3, false, $4::timestamptz)', [
      event.eventId,
      author,
      subject,
      answeredAt,
    ])
}

/** Idempotent: an event id that already exists is left alone. */
export async function seedHistory(db: Db, now: number): Promise<number> {
  let inserted = 0
  for (const event of pastEvents) {
    const existing = await db.query('select 1 from events where id = $1', [event.eventId])
    if (existing.length > 0) continue
    await insertPastEvent(db, event, now)
    inserted += 1
  }
  return inserted
}
