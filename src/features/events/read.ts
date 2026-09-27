import type { Db } from '@/lib/db'
import type { EventFeedback } from '@/features/feedback/event'

/**
 * Plan and hangout reads, with the privacy rules applied in SQL: a person sees an event only
 * while they are a non-withdrawn participant; co-participants' phones appear only for scheduled
 * (not cancelled) events; only the viewer's own feedback answers are returned.
 */

export interface PlanVenue {
  provider: string
  placeId?: string | null
  name: string
  address: string
  lat: number
  lng: number
  hoursVerified: boolean
}

export interface PlanParticipant {
  userId: string
  name: string
  interests: string[]
  phone: string | null
}

export interface Plan {
  eventId: string
  status: 'scheduled' | 'cancelled'
  startsAt: number
  endsAt: number
  timezone: string
  activity: { id: string; name: string; durationMinutes: number }
  venue: PlanVenue
  explanation: string
  participants: PlanParticipant[]
  canWithdraw: boolean
  /** Whether the viewer's connected calendar holds this hangout. */
  calendarStatus: 'created' | 'failed' | 'cancelled' | null
}

interface EventRow {
  id: string
  status: 'scheduled' | 'cancelled'
  starts_at: Date
  ends_at: Date
  timezone: string
  activity_id: string
  activity_name: string
  duration_minutes: number
  explanation: string
  venue: {
    provider: string
    place_id?: string | null
    name: string
    address: string
    lat: number
    lng: number
    hours_verified: boolean
  }
  calendar_status: 'created' | 'failed' | 'cancelled' | null
}

interface ParticipantRow {
  event_id: string
  user_id: string
  name: string
  interests: string[]
  phone: string | null
}

const eventColumns =
  'e.id, e.status, e.starts_at, e.ends_at, e.timezone, e.activity_id, e.activity_name, e.duration_minutes, e.explanation, e.venue, x.status as calendar_status'

async function participantsFor(
  db: Db,
  eventIds: readonly string[],
): Promise<Map<string, PlanParticipant[]>> {
  const rows = await db.query<ParticipantRow>(
    `select ep.event_id, p.id as user_id, p.name, p.interests,
       case when e.status = 'scheduled' then p.phone_e164 else null end as phone
     from event_participants ep
     join events e on e.id = ep.event_id
     join profiles p on p.id = ep.user_id
     where ep.event_id = any($1::uuid[]) and ep.withdrawn_at is null
     order by p.name, p.id`,
    [[...eventIds]],
  )
  const byEvent = new Map<string, PlanParticipant[]>()
  for (const row of rows) {
    const list = byEvent.get(row.event_id) ?? []
    list.push({ userId: row.user_id, name: row.name, interests: row.interests, phone: row.phone })
    byEvent.set(row.event_id, list)
  }
  return byEvent
}

function toPlan(row: EventRow, participants: PlanParticipant[], now: number): Plan {
  return {
    eventId: row.id,
    status: row.status,
    startsAt: row.starts_at.getTime(),
    endsAt: row.ends_at.getTime(),
    timezone: row.timezone,
    activity: {
      id: row.activity_id,
      name: row.activity_name,
      durationMinutes: row.duration_minutes,
    },
    venue: {
      provider: row.venue.provider,
      placeId: row.venue.place_id ?? null,
      name: row.venue.name,
      address: row.venue.address,
      lat: row.venue.lat,
      lng: row.venue.lng,
      hoursVerified: row.venue.hours_verified,
    },
    explanation: row.explanation,
    participants,
    canWithdraw: row.status === 'scheduled' && row.starts_at.getTime() > now,
    calendarStatus: row.calendar_status,
  }
}

async function plansFromRows(db: Db, rows: EventRow[], now: number): Promise<Plan[]> {
  if (rows.length === 0) return []
  const participants = await participantsFor(
    db,
    rows.map((row) => row.id),
  )
  return rows.map((row) => toPlan(row, participants.get(row.id) ?? [], now))
}

/** Upcoming and cancelled plans the viewer is (still) part of, soonest first. */
export async function loadPlans(db: Db, userId: string, now: number): Promise<Plan[]> {
  const rows = await db.query<EventRow>(
    `select ${eventColumns} from events e
     join event_participants me on me.event_id = e.id and me.user_id = $1 and me.withdrawn_at is null
     left join event_calendar_entries x on x.event_id = e.id and x.user_id = $1
     where e.ends_at > $2::timestamptz or e.status = 'cancelled'
     order by e.starts_at desc limit 50`,
    [userId, new Date(now).toISOString()],
  )
  return plansFromRows(
    db,
    rows.sort((a, b) => a.starts_at.getTime() - b.starts_at.getTime()),
    now,
  )
}

export async function loadPlan(
  db: Db,
  userId: string,
  eventId: string,
  now: number,
): Promise<Plan | null> {
  const rows = await db.query<EventRow>(
    `select ${eventColumns} from events e
     join event_participants me on me.event_id = e.id and me.user_id = $1 and me.withdrawn_at is null
     left join event_calendar_entries x on x.event_id = e.id and x.user_id = $1
     where e.id = $2`,
    [userId, eventId],
  )
  const plans = await plansFromRows(db, rows, now)
  return plans[0] ?? null
}

export interface HangoutPerson {
  userId: string
  name: string
  interests: string[]
  myAnswer: 'yes' | 'no' | null
  isMutualFriend: boolean
}

export interface Hangout {
  eventId: string
  endedAt: number
  timezone: string
  activityName: string
  venueName: string
  people: HangoutPerson[]
  myEventFeedback?: EventFeedback | null
}

interface HangoutRow {
  id: string
  ends_at: Date
  timezone: string
  activity_name: string
  venue_name: string
  feedback_text: string | null
  memories_updated: boolean | null
  memory_update_failed: boolean
}

interface HangoutPersonRow {
  event_id: string
  user_id: string
  name: string
  interests: string[]
  meet_again: boolean | null
  is_friend: boolean
}

/** Completed, non-cancelled hangouts with the viewer's own answers and friendship outcomes only. */
export async function loadHangouts(
  db: Db,
  userId: string,
  now: number,
  eventId?: string,
): Promise<Hangout[]> {
  const events = await db.query<HangoutRow>(
    `select e.id, e.ends_at, e.timezone, e.activity_name, coalesce(e.venue->>'name', '') as venue_name,
       ef.text as feedback_text, ef.memories_updated,
       (not ef.memories_updated and ef.memory_attempts >= 5 and
         (ef.memory_lease_until is null or ef.memory_lease_until < $2::timestamptz)) as memory_update_failed from events e
     join event_participants me on me.event_id = e.id and me.user_id = $1 and me.withdrawn_at is null
     left join event_feedback ef on ef.event_id = e.id and ef.user_id = $1
     where e.status = 'scheduled' and e.ends_at <= $2::timestamptz
       and ($3::uuid is null or e.id = $3::uuid)
     order by e.ends_at desc limit 50`,
    [userId, new Date(now).toISOString(), eventId ?? null],
  )
  if (events.length === 0) return []
  const people = await db.query<HangoutPersonRow>(
    `select ep.event_id, p.id as user_id, p.name, p.interests,
       (select pf.meet_again from participant_feedback pf where pf.event_id = ep.event_id and pf.author_id = $1 and pf.subject_id = p.id) as meet_again,
       exists (select 1 from friendships f where f.user_a = least($1::uuid, p.id) and f.user_b = greatest($1::uuid, p.id)) as is_friend
     from event_participants ep join profiles p on p.id = ep.user_id
     where ep.event_id = any($2::uuid[]) and ep.withdrawn_at is null and ep.user_id <> $1
     order by p.name, p.id`,
    [userId, events.map((event) => event.id)],
  )
  return events.map((event) => ({
    eventId: event.id,
    endedAt: event.ends_at.getTime(),
    timezone: event.timezone,
    activityName: event.activity_name,
    venueName: event.venue_name,
    myEventFeedback:
      event.feedback_text === null
        ? null
        : {
            text: event.feedback_text,
            memoriesUpdated: event.memories_updated ?? false,
            memoryUpdateFailed: event.memory_update_failed ?? false,
          },
    people: people
      .filter((person) => person.event_id === event.id)
      .map((person) => ({
        userId: person.user_id,
        name: person.name,
        interests: person.interests,
        myAnswer: person.meet_again === null ? null : person.meet_again ? 'yes' : 'no',
        isMutualFriend: person.is_friend,
      })),
  }))
}
