import type { MemoryDraft } from '@/features/ai/schemas'
import { type Activity, activities } from '@/features/planning/activities/catalog'
import { buildExplanation } from '@/features/planning/activities/explanation'
import type { Interest } from '@/features/profile/interests'
import type { PastEvent } from './history'
import { type Persona, torontoKey, vancouverKey } from './people'

/**
 * Generates any number of fictional people and past hangouts from fixed lists. The same index
 * always yields the same person, so seeding again updates people instead of duplicating them.
 * Each answer is a fixed sentence paired with the memory it supports, which keeps memory evidence
 * verbatim.
 */

interface Trait {
  interests: Interest[]
  answer: string
  topic: string
  summary: string
  evidence: string
  attributes: Record<string, string>
}

const weekendTraits: Trait[] = [
  {
    interests: ['coffee', 'books'],
    answer:
      'A slow morning at a neighbourhood cafe with a paperback, then a wander through whatever bookshop is nearby.',
    topic: 'cafes and bookshops',
    summary: 'Likes slow cafe mornings and browsing bookshops.',
    evidence: 'A slow morning at a neighbourhood cafe with a paperback',
    attributes: { setting: 'quiet', pace: 'unhurried' },
  },
  {
    interests: ['hiking', 'nature'],
    answer:
      'Getting out of the city early for a trail with a view, and being back in time for a late lunch.',
    topic: 'day hikes',
    summary: 'Enjoys early day hikes on scenic trails.',
    evidence: 'a trail with a view',
    attributes: { setting: 'outdoors', intensity: 'moderate' },
  },
  {
    interests: ['cooking', 'markets', 'food'],
    answer:
      'Picking up vegetables at the market and cooking something ambitious for whoever is free that evening.',
    topic: 'cooking for others',
    summary: 'Likes shopping at markets and cooking for friends.',
    evidence: 'cooking something ambitious for whoever is free',
    attributes: { setting: 'home or market', social_style: 'host' },
  },
  {
    interests: ['board games'],
    answer:
      'A long table, a stack of board games, and enough snacks that nobody needs to leave before midnight.',
    topic: 'board game nights',
    summary: 'Enjoys long, relaxed board game sessions.',
    evidence: 'a stack of board games',
    attributes: { intensity: 'low', preferred_time: 'evening' },
  },
  {
    interests: ['live music', 'music'],
    answer:
      'Finding a small venue with a band I have never heard of and standing close enough to see their hands.',
    topic: 'small music venues',
    summary: 'Seeks out unfamiliar bands at small venues.',
    evidence: 'a small venue with a band I have never heard of',
    attributes: { setting: 'small venues', preferred_time: 'evening' },
  },
  {
    interests: ['museums', 'art'],
    answer:
      'An unhurried museum visit, one gallery at a time, followed by arguing about our favourite piece.',
    topic: 'museum visits',
    summary: 'Prefers slow museum visits with discussion afterwards.',
    evidence: 'An unhurried museum visit, one gallery at a time',
    attributes: { pace: 'unhurried', setting: 'indoors' },
  },
  {
    interests: ['cycling', 'nature'],
    answer: 'A long bike ride along the water with a stop for something cold halfway through.',
    topic: 'waterfront cycling',
    summary: 'Likes long, easygoing bike rides with a break.',
    evidence: 'A long bike ride along the water',
    attributes: { setting: 'outdoors', intensity: 'moderate' },
  },
  {
    interests: ['film', 'food'],
    answer:
      'A matinee at the independent cinema, then a long debrief over noodles about what it all meant.',
    topic: 'independent cinema',
    summary: 'Enjoys independent films and talking them over with food.',
    evidence: 'A matinee at the independent cinema',
    attributes: { preferred_time: 'daytime', setting: 'indoors' },
  },
  {
    interests: ['climbing', 'yoga'],
    answer: 'An easy morning at the climbing gym and a stretch afterwards, nothing competitive.',
    topic: 'casual climbing',
    summary: 'Likes relaxed, non-competitive climbing sessions.',
    evidence: 'An easy morning at the climbing gym',
    attributes: { intensity: 'low', preferred_time: 'morning' },
  },
  {
    interests: ['running', 'dogs'],
    answer: 'A run through the park with my dog, who sets the pace and chooses the route.',
    topic: 'park runs',
    summary: 'Runs in the park with a dog at an easy pace.',
    evidence: 'A run through the park with my dog',
    attributes: { setting: 'outdoors', pace: 'easy' },
  },
]

const meetingTraits: Trait[] = [
  {
    interests: [],
    answer:
      'Small groups of three or four, where everyone gets a turn to talk and nobody has to shout.',
    topic: 'small groups',
    summary: 'Most comfortable in groups of three or four.',
    evidence: 'Small groups of three or four',
    attributes: { group_comfort: 'small groups' },
  },
  {
    interests: [],
    answer:
      'I warm up slowly, so an activity with a clear start and end helps me more than open-ended drinks.',
    topic: 'structured plans',
    summary: 'Prefers activities with a clear start and end.',
    evidence: 'an activity with a clear start and end',
    attributes: { social_style: 'structured', pace: 'slow to warm up' },
  },
  {
    interests: [],
    answer:
      'I am happy to talk to anyone, and I tend to be the one who makes sure the quiet person is included.',
    topic: 'including others',
    summary: 'Outgoing, and makes a point of including quieter people.',
    evidence: 'I am happy to talk to anyone',
    attributes: { social_style: 'outgoing' },
  },
  {
    interests: [],
    answer:
      'Doing something side by side, like walking or cooking, makes conversation feel much easier to me.',
    topic: 'side by side activities',
    summary: 'Finds conversation easier during a shared activity.',
    evidence: 'Doing something side by side, like walking or cooking',
    attributes: { social_style: 'activity first' },
  },
  {
    interests: [],
    answer: 'Daytime plans suit me best; I am at my most talkative before the evening gets late.',
    topic: 'daytime plans',
    summary: 'Prefers daytime plans over late evenings.',
    evidence: 'Daytime plans suit me best',
    attributes: { preferred_time: 'daytime' },
  },
  {
    interests: [],
    answer:
      'I like meeting people who are different from me, as long as the place is calm enough to hear them.',
    topic: 'calm places',
    summary: 'Open to new kinds of people, in calm settings.',
    evidence: 'as long as the place is calm enough to hear them',
    attributes: { setting: 'quiet', openness: 'high' },
  },
  {
    interests: ['sports'],
    answer: 'A bit of friendly competition breaks the ice for me faster than small talk ever does.',
    topic: 'friendly competition',
    summary: 'Warms up through light, friendly competition.',
    evidence: 'A bit of friendly competition breaks the ice for me',
    attributes: { social_style: 'playful competitive' },
  },
  {
    interests: [],
    answer:
      'I prefer plans that are easy to leave, so a short first meeting feels more comfortable than a whole day.',
    topic: 'short first meetings',
    summary: 'Prefers short, low-pressure first meetings.',
    evidence: 'a short first meeting feels more comfortable than a whole day',
    attributes: { duration: 'short', pace: 'low pressure' },
  },
]

const tryNewTraits: Trait[] = [
  {
    interests: ['pottery', 'crafts'],
    answer: 'A pottery class, even though I expect my first bowl to collapse.',
    topic: 'pottery',
    summary: 'Wants to try a pottery class as a beginner.',
    evidence: 'A pottery class',
    attributes: { experience_level: 'beginner' },
  },
  {
    interests: ['climbing'],
    answer: 'Indoor bouldering with someone patient enough to explain the basics.',
    topic: 'bouldering',
    summary: 'Curious about bouldering with patient guidance.',
    evidence: 'Indoor bouldering with someone patient',
    attributes: { experience_level: 'beginner', intensity: 'low' },
  },
  {
    interests: ['trivia'],
    answer: 'A pub trivia night, where I can finally put my useless knowledge to work.',
    topic: 'trivia nights',
    summary: 'Wants to join a pub trivia night.',
    evidence: 'A pub trivia night',
    attributes: { preferred_time: 'evening', social_style: 'team' },
  },
  {
    interests: ['dance', 'music'],
    answer: 'A beginner salsa lesson, provided everyone else is also a beginner.',
    topic: 'salsa lessons',
    summary: 'Open to a salsa lesson among other beginners.',
    evidence: 'A beginner salsa lesson',
    attributes: { experience_level: 'beginner' },
  },
  {
    interests: ['languages', 'travel'],
    answer: 'A language exchange evening where I can practise my very rusty Spanish.',
    topic: 'language exchange',
    summary: 'Wants to practise Spanish at a language exchange.',
    evidence: 'A language exchange evening',
    attributes: { language: 'spanish', experience_level: 'rusty' },
  },
  {
    interests: ['photography'],
    answer: 'A photo walk at golden hour with people who know how to use their cameras.',
    topic: 'photo walks',
    summary: 'Wants to join a photo walk and learn from others.',
    evidence: 'A photo walk at golden hour',
    attributes: { setting: 'outdoors', preferred_time: 'evening' },
  },
  {
    interests: ['comedy', 'theatre'],
    answer: 'An open mic comedy night, strictly from the safety of the audience.',
    topic: 'comedy nights',
    summary: 'Wants to watch an open mic comedy night.',
    evidence: 'An open mic comedy night',
    attributes: { role: 'audience', preferred_time: 'evening' },
  },
  {
    interests: ['baking', 'cooking'],
    answer: 'A sourdough workshop, because my attempts at home keep coming out flat.',
    topic: 'sourdough',
    summary: 'Wants to learn sourdough baking in a workshop.',
    evidence: 'A sourdough workshop',
    attributes: { experience_level: 'beginner' },
  },
  {
    interests: ['volunteering', 'nature'],
    answer: 'Volunteering at a community garden for a morning and getting my hands dirty.',
    topic: 'community gardening',
    summary: 'Wants to volunteer at a community garden.',
    evidence: 'Volunteering at a community garden for a morning',
    attributes: { setting: 'outdoors', preferred_time: 'morning' },
  },
  {
    interests: ['sports'],
    answer: 'Something silly like mini golf or bowling, where being bad at it is part of the fun.',
    topic: 'casual games',
    summary: 'Enjoys low-stakes games like mini golf or bowling.',
    evidence: 'Something silly like mini golf or bowling',
    attributes: { intensity: 'low', social_style: 'playful' },
  },
]

const firstNames =
  'Aiden Amara Anika Arjun Bea Camila Dario Elena Emeka Farah Felix Grace Hana Imani Jonas Kavya Leila Lucas Mateo Mei Nadia Nikhil Olive Omar Paloma Quinn Rafael Rosa Sanjay Selin Tariq Thea Uma Viktor Wren Xavier Yara Yusuf Zainab Zoe'.split(
    ' ',
  )

const lastNames =
  'Abara Bergstrom Chaudhry Delacroix Eze Fontaine Gallo Haddad Ivanova Jansen Kowalski Lindqvist Mbeki Nakamura Oyelaran Petrov Quispe Reyes Sandoval Tanaka Umeh Varga Whitlock Xiong Yilmaz Zubiri Achterberg Bianchi Castellanos Dimitrov Ferreira Guerrero Hosseini Iyer Jovanovic Kimura Larsen Moreau Novak Osei'.split(
    ' ',
  )

/** Where generated people live, with the area codes their fictional phone numbers use. */
export interface SeedCity {
  key: string
  areaCodes: string[]
}

const castCities: SeedCity[] = [
  { key: torontoKey, areaCodes: ['647', '437'] },
  { key: vancouverKey, areaCodes: ['778', '236'] },
]

const availabilities: Persona['availability'][] = [
  [
    { start: '18:00', end: '21:00' },
    { start: '10:00', end: '13:00' },
  ],
  [
    { start: '17:30', end: '20:30' },
    { start: '11:00', end: '14:00' },
  ],
  [
    { start: '18:30', end: '21:30' },
    { start: '09:30', end: '12:30' },
  ],
  [
    { start: '19:00', end: '22:00' },
    { start: '13:00', end: '16:00' },
  ],
  [
    { start: '12:00', end: '15:00' },
    { start: '18:00', end: '20:30' },
  ],
]

const phonesPerAreaCode = 100
const youngestAge = 21
const ageSpread = 25
const earliestDaysAgo = 3
const daysAgoSpread = 88
const smallestGroup = 2
const groupSpread = 4
const yesShare = 0.6
const answeredShare = 0.8

type Random = () => number

/** Mulberry32: a tiny seeded generator. Math.random cannot be seeded, so reruns would differ. */
function randomFrom(seed: number): Random {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = Math.imul(state ^ (state >>> 15), state | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(items: readonly T[], random: Random): T {
  return items[Math.floor(random() * items.length)]!
}

const padded = (value: number, width: number) => String(value).padStart(width, '0')

function memoryFrom(trait: Trait): MemoryDraft {
  return {
    topic: trait.topic,
    summary: trait.summary,
    evidence: [trait.evidence],
    attributes: Object.entries(trait.attributes).map(([key, value]) => ({ key, value })),
    confidence: 0.7,
  }
}

function generatedPerson(index: number, cities: readonly SeedCity[]): Persona {
  const random = randomFrom(index + 1)
  const city = cities[index % cities.length]!
  const indexInCity = Math.floor(index / cities.length)
  const areaCode =
    city.areaCodes[Math.floor(indexInCity / phonesPerAreaCode) % city.areaCodes.length]
  const first = pick(firstNames, random)
  const last = pick(lastNames, random)
  const traits = [
    pick(weekendTraits, random),
    pick(meetingTraits, random),
    pick(tryNewTraits, random),
  ]
  return {
    id: `00000000-0000-4000-8000-9${padded(index + 1, 11)}`,
    email: `${first}.${last}.${index + 1}@convene.demo`.toLowerCase(),
    name: `${first} ${last}`,
    age: youngestAge + Math.floor(random() * ageSpread),
    cityKey: city.key,
    phone: `+1${areaCode}55501${padded(indexInCity % phonesPerAreaCode, 2)}`,
    interests: [...new Set(traits.flatMap((trait) => trait.interests))],
    answers: [
      { promptId: 'weekend', text: traits[0]!.answer },
      { promptId: 'meeting_people', text: traits[1]!.answer },
      { promptId: 'try_new', text: traits[2]!.answer },
    ],
    memories: traits.map(memoryFrom),
    isOnboarded: true,
    availability: pick(availabilities, random),
  }
}

/** People are dealt across `cities` in turn. */
export function generatedPeople(
  count: number,
  cities: readonly SeedCity[] = castCities,
): Persona[] {
  return Array.from({ length: count }, (_, index) => generatedPerson(index, cities))
}

/** Removes and returns `size` random members; fewer when the pool runs out. */
function drawn(pool: Persona[], size: number, random: Random): Persona[] {
  const members: Persona[] = []
  while (members.length < size && pool.length > 0)
    members.push(...pool.splice(Math.floor(random() * pool.length), 1))
  return members
}

/** The catalog activity whose tags cover the most of the members' interests. */
function fittingActivity(members: readonly Persona[]): Activity {
  const held = members.flatMap((member) => member.interests)
  const fit = (activity: Activity) => held.filter((interest) => activity.tags.includes(interest))
  return activities.reduce((best, activity) =>
    fit(activity).length > fit(best).length ? activity : best,
  )
}

export type Answers = Pick<PastEvent, 'yes' | 'no'>

/** Most pairs answer, most answers are yes; mutual yes becomes a friendship when seeded. */
function generatedAnswers(members: readonly Persona[], random: Random): Answers {
  const answers: Answers = { yes: [], no: [] }
  const pairs = members.flatMap((author) =>
    members.filter((subject) => subject !== author).map((subject) => [author.id, subject.id]),
  ) as [string, string][]
  for (const pair of pairs) {
    const roll = random()
    if (roll < yesShare) answers.yes.push(pair)
    else if (roll < answeredShare) answers.no.push(pair)
  }
  return answers
}

export interface PastEventDraft {
  eventId: string
  daysAgo: number
  /** All from one city; the first member's city is the event's. */
  members: readonly Persona[]
  answers: Answers
}

/** A past hangout for these members, with the activity and explanation that fit them. */
export function pastEventAmong(draft: PastEventDraft): PastEvent {
  const activity = fittingActivity(draft.members)
  return {
    eventId: draft.eventId,
    cityKey: draft.members[0]!.cityKey,
    daysAgo: draft.daysAgo,
    members: draft.members.map((member) => member.id),
    activityId: activity.id,
    activityName: activity.name,
    venueName: `(Demo) ${activity.name} on Main`,
    explanation: buildExplanation(
      draft.members.map((member) => ({
        userId: member.id,
        embedding: null,
        interests: member.interests,
        memories: [],
      })),
      activity.name,
    ),
    ...draft.answers,
  }
}

function generatedPastEvent(
  index: number,
  people: readonly Persona[],
  booked: Set<string>,
): PastEvent | null {
  const random = randomFrom(1_000_000 + index)
  const cityKeys = [...new Set(people.map((person) => person.cityKey))]
  const cityKey = cityKeys[index % cityKeys.length]
  const daysAgo = earliestDaysAgo + Math.floor(random() * daysAgoSpread)
  const isFree = (person: Persona) =>
    person.cityKey === cityKey && person.isOnboarded && !booked.has(`${person.id}:${daysAgo}`)
  const size = smallestGroup + Math.floor(random() * groupSpread)
  const members = drawn(people.filter(isFree), size, random)
  if (members.length < smallestGroup) return null
  for (const member of members) booked.add(`${member.id}:${daysAgo}`)
  return pastEventAmong({
    eventId: `00000000-0000-4000-8000-e9${padded(index + 1, 10)}`,
    daysAgo,
    members,
    answers: generatedAnswers(members, random),
  })
}

/**
 * Past hangouts among `people`, in each of their cities in turn. One person is never in two
 * events on the same day, nor on a day listed in `booked` as `personId:daysAgo`.
 */
export function generatedPastEvents(
  people: readonly Persona[],
  count: number,
  booked: ReadonlySet<string> = new Set(),
): PastEvent[] {
  const taken = new Set(booked)
  const events: PastEvent[] = []
  for (let index = 0; index < count; index += 1) {
    const event = generatedPastEvent(index, people, taken)
    if (event) events.push(event)
  }
  return events
}
