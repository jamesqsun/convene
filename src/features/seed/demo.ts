import {
  type Answers,
  type SeedCity,
  generatedPastEvents,
  generatedPeople,
  pastEventAmong,
} from './generate'
import type { PastEvent } from './history'
import type { Persona } from './people'

/**
 * The cast for a live demonstration: twenty-five fully onboarded people in one city, so a
 * newcomer who picks that city is matched into a full group, plus a showcase account whose
 * history fills the friend graph.
 */

export const demoCity: SeedCity = { key: 'us:georgia:atlanta', areaCodes: ['404', '470', '678'] }

export interface DemoBlock {
  dayOffset: number
  start: string
  end: string
  size: number
}

const daytime = { start: '08:00', end: '15:00' }
const evening = { start: '15:00', end: '22:00' }

/**
 * Who is free when. The planner keeps a group of up to five whole and splits six into four and
 * two, so a block holds three or four people: one more makes a whole group of four or five.
 * Blocks on a day touch without overlapping. If they overlapped, the planner would group the
 * two blocks together first and could leave the newcomer unmatched. Three days out is always
 * past the 48-hour cutoff, whatever time of day the seed runs.
 */
export const demoBlocks: DemoBlock[] = [
  { dayOffset: 3, ...evening, size: 4 },
  { dayOffset: 3, ...daytime, size: 3 },
  { dayOffset: 4, ...daytime, size: 4 },
  { dayOffset: 4, ...evening, size: 3 },
  { dayOffset: 5, ...evening, size: 4 },
  { dayOffset: 5, ...daytime, size: 3 },
  { dayOffset: 6, ...evening, size: 4 },
]

const showcaseHangoutDaysAgo = [2, 16, 41, 75]
const showcaseCompanions = 3
const otherHangouts = 10

function blockOf(index: number): DemoBlock {
  let firstInBlock = 0
  for (const block of demoBlocks) {
    if (index < firstInBlock + block.size) return block
    firstInBlock += block.size
  }
  throw new Error(`No demo block holds person ${index}`)
}

export function demoPeople(): Persona[] {
  const count = demoBlocks.reduce((total, block) => total + block.size, 0)
  return generatedPeople(count, [demoCity]).map((person, index) => {
    const { dayOffset, start, end } = blockOf(index)
    return { ...person, availability: [{ dayOffset, start, end }] }
  })
}

/** The account to sign in as when showing a lived-in profile and a full friend graph. */
export function demoShowcase(people: readonly Persona[]): Persona {
  return people[0]!
}

function everyoneSaysYes(members: readonly Persona[]): Answers {
  const yes = members.flatMap((author) =>
    members.filter((subject) => subject !== author).map((subject) => [author.id, subject.id]),
  ) as [string, string][]
  return { yes, no: [] }
}

/** Hangouts the showcase shared with three different people each time, all of them friends now. */
function showcaseHangouts(people: readonly Persona[]): PastEvent[] {
  const others = people.filter((person) => person !== demoShowcase(people))
  return showcaseHangoutDaysAgo.map((daysAgo, index) => {
    const companions = others.slice(
      index * showcaseCompanions,
      index * showcaseCompanions + showcaseCompanions,
    )
    const members = [demoShowcase(people), ...companions]
    return pastEventAmong({
      eventId: `00000000-0000-4000-8000-e8${String(index + 1).padStart(10, '0')}`,
      daysAgo,
      members,
      answers: everyoneSaysYes(members),
    })
  })
}

export function demoPastEvents(people: readonly Persona[]): PastEvent[] {
  const showcase = showcaseHangouts(people)
  const booked = new Set(
    showcase.flatMap((event) => event.members.map((id) => `${id}:${event.daysAgo}`)),
  )
  return [...showcase, ...generatedPastEvents(people, otherHangouts, booked)]
}
