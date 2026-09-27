import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeAiProvider } from '@/features/ai/fake'
import { fakeCalendarProvider } from '@/features/calendar/fake'
import { resolveCity } from '@/features/cities/search'
import { loadGraph } from '@/features/graph/read'
import { runPlanningTick } from '@/features/planning/batch/driver'
import { fictionalVenueProvider } from '@/features/planning/venues/fictional'
import { fakePushSender } from '@/features/push/fake'
import type { Db } from '@/lib/db'
import { addLocalDays, localDateOf, zonedTime } from '@/lib/time'
import { createTestDb, createUser } from '../../../supabase/tests/harness'
import { demoBlocks, demoCity, demoPastEvents, demoPeople, demoShowcase } from './demo'
import { seedDemoWorld } from './seed'

const atlanta = resolveCity(demoCity.key)!
const now = zonedTime(atlanta.timezone, '2026-09-28', 21, 30)
const people = demoPeople()
const pastEvents = demoPastEvents(people)

const toMinutes = (clock: string) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3))

describe('demo cast', () => {
  it('is twenty-five fully onboarded people in the demo city, the same on every run', () => {
    expect(people).toHaveLength(25)
    expect(demoPeople()).toEqual(people)
    expect(people.every((person) => person.cityKey === demoCity.key)).toBe(true)
    expect(people.every((person) => person.isOnboarded)).toBe(true)
    expect(people.every((person) => person.memories.length === 3)).toBe(true)
    expect(people.every((person) => person.email.endsWith('@convene.demo'))).toBe(true)
    expect(people.every((person) => /^\+1(404|470|678)55501\d{2}$/.test(person.phone))).toBe(true)
    expect(new Set(people.map((person) => person.phone)).size).toBe(25)
    expect(demoShowcase(people)).toBe(people[0])
  })

  it('puts everyone in exactly one block, and blocks hold three or four people', () => {
    expect(demoBlocks.reduce((total, block) => total + block.size, 0)).toBe(25)
    expect(demoBlocks.every((block) => block.size === 3 || block.size === 4)).toBe(true)
    for (const block of demoBlocks) {
      const members = people.filter(
        (person) =>
          person.availability.length === 1 &&
          person.availability[0]!.dayOffset === block.dayOffset &&
          person.availability[0]!.start === block.start &&
          person.availability[0]!.end === block.end,
      )
      expect(members).toHaveLength(block.size)
    }
  })

  it('keeps blocks at least three days out and never overlapping on a day', () => {
    expect(demoBlocks.every((block) => block.dayOffset >= 3)).toBe(true)
    for (const block of demoBlocks) {
      const sameDay = demoBlocks.filter((other) => other.dayOffset === block.dayOffset)
      const overlapping = sameDay.filter(
        (other) =>
          toMinutes(other.start) < toMinutes(block.end) &&
          toMinutes(block.start) < toMinutes(other.end),
      )
      expect(overlapping).toEqual([block])
    }
  })

  it('gives the showcase account twelve mutual friends across four hangouts', () => {
    const showcase = demoShowcase(people).id
    const friends = new Set<string>()
    for (const event of pastEvents) {
      for (const [author, subject] of event.yes) {
        const isMutual = event.yes.some(([a, b]) => a === subject && b === author)
        if (author === showcase && isMutual) friends.add(subject)
      }
    }
    expect(friends.size).toBeGreaterThanOrEqual(12)
    expect(
      pastEvents.filter((event) => event.members.includes(showcase)).length,
    ).toBeGreaterThanOrEqual(4)
  })

  it('never books a person into two past hangouts on the same day', () => {
    const bookings = pastEvents.flatMap((event) =>
      event.members.map((id) => `${id}:${event.daysAgo}`),
    )
    expect(new Set(bookings).size).toBe(bookings.length)
    expect(new Set(pastEvents.map((event) => event.eventId)).size).toBe(pastEvents.length)
  })
})

describe('demo cast in the planner', () => {
  let db: Db

  beforeEach(async () => {
    db = await createTestDb()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await seedDemoWorld(db, fakeAiProvider(), { now, people, pastEvents })
  })

  async function newcomerFreeAt(dayOffset: number, start: number, end: number): Promise<string> {
    const userId = await createUser(db, {
      name: 'Newcomer',
      cityKey: atlanta.key,
      timezone: atlanta.timezone,
      interests: ['coffee', 'books'],
    })
    const date = addLocalDays(localDateOf(atlanta.timezone, now), dayOffset)
    await db.query(
      `insert into availability_slots (user_id, "window", timezone) values ($1, tstzrange($2::timestamptz, $3::timestamptz, '[)'), $4)`,
      [
        userId,
        new Date(zonedTime(atlanta.timezone, date, start)).toISOString(),
        new Date(zonedTime(atlanta.timezone, date, end)).toISOString(),
        atlanta.timezone,
      ],
    )
    return userId
  }

  async function plan(): Promise<void> {
    await runPlanningTick(
      {
        db,
        providers: {
          ai: fakeAiProvider(),
          venues: fictionalVenueProvider(),
          push: fakePushSender(),
          calendar: fakeCalendarProvider(),
        },
        workerId: 'test',
        clock: () => now,
        tokenSecret: 'x'.repeat(32),
      },
      { allBatches: true },
    )
  }

  async function groupSizes(): Promise<number[]> {
    const rows = await db.query<{ n: number }>(
      `select count(*)::int as n from event_participants ep join events e on e.id = ep.event_id
       where e.starts_at > $1::timestamptz group by ep.event_id order by 1`,
      [new Date(now).toISOString()],
    )
    return rows.map((row) => row.n)
  }

  async function groupSizeOf(userId: string): Promise<number | null> {
    const rows = await db.query<{ n: number }>(
      `select (select count(*)::int from event_participants o where o.event_id = ep.event_id) as n
       from event_participants ep where ep.user_id = $1`,
      [userId],
    )
    return rows[0]?.n ?? null
  }

  it('plans the cast alone into one group per block', async () => {
    await plan()
    expect(await groupSizes()).toEqual([3, 3, 3, 4, 4, 4, 4])
  })

  it('puts a newcomer who joins a block of four into a group of five', async () => {
    const block = demoBlocks.find((candidate) => candidate.size === 4)!
    const startHour = toMinutes(block.start) / 60
    const newcomer = await newcomerFreeAt(block.dayOffset, startHour + 2, startHour + 5)
    await plan()
    expect(await groupSizeOf(newcomer)).toBe(5)
    expect(await groupSizes()).toEqual([3, 3, 3, 4, 4, 4, 5])
  })

  it('puts a newcomer who joins a block of three into a group of four', async () => {
    const block = demoBlocks.find((candidate) => candidate.size === 3)!
    const startHour = toMinutes(block.start) / 60
    const newcomer = await newcomerFreeAt(block.dayOffset, startHour + 1, startHour + 3)
    await plan()
    expect(await groupSizeOf(newcomer)).toBe(4)
  })

  it('still matches a newcomer whose window straddles two blocks', async () => {
    const day = demoBlocks.find((block) =>
      demoBlocks.some((other) => other !== block && other.dayOffset === block.dayOffset),
    )!.dayOffset
    const newcomer = await newcomerFreeAt(day, 14, 16)
    await plan()
    expect(await groupSizeOf(newcomer)).toBeGreaterThanOrEqual(4)
    expect((await groupSizes()).every((size) => size >= 3)).toBe(true)
  })

  it('shows the showcase account a graph of at least twelve friends', async () => {
    const graph = await loadGraph(db, demoShowcase(people).id, now)
    expect(graph.length).toBeGreaterThanOrEqual(12)
    expect(new Set(graph.map((node) => node.lastMetAt)).size).toBeGreaterThanOrEqual(4)
  })
})
