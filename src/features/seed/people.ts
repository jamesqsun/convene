import type { Interest } from '@/features/profile/interests'
import type { Answer } from '@/features/profile/schemas'
import type { MemoryDraft } from '@/features/ai/schemas'

/**
 * Twelve fictional people. Every name, phone, answer, and memory is invented; the phone numbers use
 * the reserved 555 range. Memory evidence is copied verbatim from the answers, as the real
 * pipeline requires.
 */
export interface Persona {
  id: string
  email: string
  name: string
  age: number
  cityKey: string
  phone: string
  interests: Interest[]
  answers: Answer[]
  memories: MemoryDraft[]
  isOnboarded: boolean
  /**
   * Local clock times for the seeded availability. Entries fall on consecutive days starting two
   * days out, unless one names its own `dayOffset` from today.
   */
  availability: { start: string; end: string; dayOffset?: number }[]
}

export const torontoKey = 'ca:ontario:toronto'
export const vancouverKey = 'ca:british columbia:vancouver'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

function memory(
  topic: string,
  summary: string,
  evidence: string,
  attributes: Record<string, string>,
  confidence = 0.7,
): MemoryDraft {
  return {
    topic,
    summary,
    evidence: [evidence],
    attributes: Object.entries(attributes).map(([key, value]) => ({ key, value })),
    confidence,
  }
}

function answers(weekend: string, meetingPeople: string, tryNew: string): Answer[] {
  return [
    { promptId: 'weekend', text: weekend },
    { promptId: 'meeting_people', text: meetingPeople },
    { promptId: 'try_new', text: tryNew },
  ]
}

export const personas: Persona[] = [
  {
    id: id(1),
    email: 'maya@convene.demo',
    name: 'Maya Okafor',
    age: 29,
    cityKey: torontoKey,
    phone: '+14165550101',
    interests: ['coffee', 'hiking', 'books', 'photography'],
    answers: answers(
      'A slow start with a long walk somewhere green, then coffee in a place quiet enough to read for an hour.',
      'Small groups where there is something to do with our hands, so conversation can come and go without pressure.',
      'A beginner bouldering session, as long as nobody expects me to be any good at it on the first try.',
    ),
    memories: [
      memory(
        'quiet cafes',
        'Prefers unhurried cafe time and reading over busy venues.',
        'coffee in a place quiet enough to read for an hour',
        { setting: 'quiet', pace: 'unhurried' },
      ),
      memory(
        'small groups',
        'Most comfortable in small groups with a shared activity.',
        'Small groups where there is something to do with our hands',
        { group_comfort: 'small groups', social_style: 'activity first' },
      ),
      memory(
        'bouldering',
        'Open to beginner bouldering with low expectations.',
        'A beginner bouldering session',
        { experience_level: 'beginner', intensity: 'low' },
        0.6,
      ),
    ],
    isOnboarded: true,
    availability: [
      { start: '18:00', end: '21:00' },
      { start: '10:00', end: '13:00' },
    ],
  },
  {
    id: id(2),
    email: 'ben@convene.demo',
    name: 'Ben Castellano',
    age: 33,
    cityKey: torontoKey,
    phone: '+14165550102',
    interests: ['coffee', 'board games', 'trivia', 'film'],
    answers: answers(
      'Board games with whoever is around, then a late film, ideally something nobody has heard of.',
      'I like a plan with a built-in structure, like a game or a quiz, so nobody has to carry the conversation.',
      'A pottery drop-in; I would be terrible at it, which is sort of the appeal.',
    ),
    memories: [
      memory(
        'board games',
        'Enjoys structured, game-based social time.',
        'Board games with whoever is around',
        { preferred_modes: 'co-op, casual competitive', intensity: 'low' },
      ),
      memory(
        'structured hangouts',
        'Prefers activities with built-in structure over open-ended chatting.',
        'a plan with a built-in structure, like a game or a quiz',
        { social_style: 'structured' },
      ),
    ],
    isOnboarded: true,
    availability: [
      { start: '17:30', end: '21:00' },
      { start: '10:30', end: '13:00' },
    ],
  },
  {
    id: id(3),
    email: 'chloe@convene.demo',
    name: 'Chloe Nguyen',
    age: 27,
    cityKey: torontoKey,
    phone: '+14165550103',
    interests: ['art', 'museums', 'coffee', 'markets'],
    answers: answers(
      'Wandering a market in the morning and an exhibition in the afternoon, with a coffee stop between.',
      'One-on-one feels intense; three or four people at a gallery or a market is my sweet spot.',
      'Live music at a small venue, the kind where you can still talk between sets.',
    ),
    memories: [
      memory(
        'galleries and markets',
        'Likes hangouts built around browsing: markets and exhibitions.',
        'Wandering a market in the morning and an exhibition in the afternoon',
        { pace: 'browsing', setting: 'galleries, markets' },
      ),
      memory(
        'group size',
        'Prefers groups of three or four over one-on-one.',
        'three or four people at a gallery or a market is my sweet spot',
        { group_comfort: 'three to four' },
      ),
    ],
    isOnboarded: true,
    availability: [
      { start: '18:00', end: '20:30' },
      { start: '11:00', end: '14:00' },
    ],
  },
  {
    id: id(4),
    email: 'dev@convene.demo',
    name: 'Dev Raman',
    age: 31,
    cityKey: torontoKey,
    phone: '+14165550104',
    interests: ['hiking', 'running', 'nature', 'photography'],
    answers: answers(
      'An early trail run, then breakfast outside if the weather allows, then nothing planned at all.',
      'Walking side by side is easier for me than sitting across a table from someone new.',
      'A photography walk at golden hour with people who do not mind stopping every ten metres.',
    ),
    memories: [
      memory(
        'outdoor movement',
        'Prefers active, outdoor meetups over sit-down ones.',
        'Walking side by side is easier for me than sitting across a table',
        { setting: 'outdoors', social_style: 'side by side' },
      ),
      memory(
        'photography walks',
        'Would enjoy slow photography walks.',
        'A photography walk at golden hour',
        { pace: 'slow', interest: 'photography' },
        0.6,
      ),
    ],
    isOnboarded: true,
    availability: [
      { start: '18:30', end: '21:00' },
      { start: '09:00', end: '12:00' },
    ],
  },
  {
    id: id(5),
    email: 'elena@convene.demo',
    name: 'Elena Marsh',
    age: 36,
    cityKey: torontoKey,
    phone: '+14165550105',
    interests: ['food', 'cooking', 'travel', 'languages'],
    answers: answers(
      'Cooking something ambitious on Saturday and eating it with friends on Sunday.',
      'Sharing a meal is the fastest way I know to feel comfortable with new people.',
      'A market stroll with someone who knows the vendors and what to buy.',
    ),
    memories: [
      memory(
        'shared meals',
        'Feels most comfortable meeting people over food.',
        'Sharing a meal is the fastest way I know to feel comfortable',
        { setting: 'restaurants, markets', social_style: 'over food' },
      ),
    ],
    isOnboarded: true,
    availability: [
      { start: '18:00', end: '21:30' },
      { start: '10:00', end: '14:00' },
    ],
  },
  {
    id: id(6),
    email: 'farid@convene.demo',
    name: 'Farid Haddad',
    age: 24,
    cityKey: torontoKey,
    phone: '+14165550106',
    interests: ['climbing', 'sports', 'video games', 'trivia'],
    answers: answers(
      'Climbing gym in the morning, games in the evening, with a nap in between if I am honest.',
      'I warm up quickly when there is a bit of friendly competition; small talk on its own is harder.',
      'Mini golf or bowling, anything with a scoreboard and low stakes.',
    ),
    memories: [
      memory(
        'friendly competition',
        'Opens up through low-stakes competitive activities.',
        'I warm up quickly when there is a bit of friendly competition',
        { intensity: 'low to medium', social_style: 'competitive' },
      ),
      memory(
        'climbing',
        'Regular climber, happy to go with beginners.',
        'Climbing gym in the morning',
        { experience_level: 'regular' },
      ),
    ],
    isOnboarded: true,
    availability: [
      { start: '19:00', end: '22:00' },
      { start: '10:00', end: '12:30' },
    ],
  },
  {
    id: id(7),
    email: 'grace@convene.demo',
    name: 'Grace Whitfield',
    age: 41,
    cityKey: torontoKey,
    phone: '+14165550107',
    interests: ['museums', 'history', 'books', 'theatre'],
    answers: answers(
      'A museum I have not been to in years, then a long dinner talking about whatever we saw.',
      'I prefer a clear plan and a set end time; I find open-ended evenings draining.',
      'A pub quiz, though only if the team takes it slightly less seriously than I would.',
    ),
    memories: [
      memory(
        'museums and history',
        'Enjoys museums and reflective conversation afterwards.',
        'A museum I have not been to in years',
        { setting: 'museums', pace: 'reflective' },
      ),
      memory(
        'clear plans',
        'Wants a defined plan and an end time.',
        'I prefer a clear plan and a set end time',
        { social_style: 'structured', energy: 'limited' },
      ),
    ],
    isOnboarded: true,
    availability: [
      { start: '18:00', end: '20:00' },
      { start: '13:00', end: '16:00' },
    ],
  },
  {
    id: id(8),
    email: 'hugo@convene.demo',
    name: 'Hugo Lindqvist',
    age: 30,
    cityKey: torontoKey,
    phone: '+14165550108',
    interests: ['live music', 'music', 'dance', 'comedy'],
    answers: answers(
      'Late nights: a show, then somewhere loud, then a very late breakfast.',
      'I am at ease anywhere with music playing; silence at a table makes me fidget.',
      'A dance class for complete beginners, taught by someone patient.',
    ),
    memories: [
      memory(
        'live music',
        'Thrives at loud, late, music-centred hangouts.',
        'a show, then somewhere loud',
        { setting: 'venues', time_of_day: 'late' },
      ),
    ],
    isOnboarded: true,
    availability: [
      { start: '20:15', end: '21:15' },
      { start: '20:00', end: '23:30' },
    ],
  },
  {
    id: id(9),
    email: 'ivy@convene.demo',
    name: 'Ivy Park',
    age: 26,
    cityKey: torontoKey,
    phone: '+14165550109',
    interests: ['yoga', 'nature', 'crafts'],
    answers: [],
    memories: [],
    isOnboarded: false,
    availability: [],
  },
  {
    id: id(10),
    email: 'jun@convene.demo',
    name: 'Jun Sato',
    age: 34,
    cityKey: vancouverKey,
    phone: '+16045550201',
    interests: ['hiking', 'coffee', 'photography', 'cycling'],
    answers: answers(
      'A trail early enough to have it to myself, then coffee with a view of the water.',
      'New people are easiest on a walk; there is always something to point at.',
      'A long cycle to somewhere I have not been, at a pace that allows talking.',
    ),
    memories: [
      memory(
        'trails and coffee',
        'Pairs outdoor time with a coffee afterwards.',
        'then coffee with a view of the water',
        { setting: 'outdoors then cafe' },
      ),
    ],
    isOnboarded: true,
    availability: [
      { start: '18:00', end: '21:00' },
      { start: '09:00', end: '12:00' },
    ],
  },
  {
    id: id(11),
    email: 'kai@convene.demo',
    name: 'Kai Fischer',
    age: 28,
    cityKey: vancouverKey,
    phone: '+16045550202',
    interests: ['board games', 'video games', 'coffee', 'comedy'],
    answers: answers(
      'A board game cafe with a big table and a game that takes all afternoon.',
      'I like meeting people through a game; it gives everyone a role and a reason to talk.',
      'A comedy night, front row, with people who will not be embarrassed by me laughing loudly.',
    ),
    memories: [
      memory(
        'games as icebreaker',
        'Meets people best through games with clear roles.',
        'meeting people through a game; it gives everyone a role',
        { social_style: 'structured', preferred_modes: 'co-op' },
      ),
    ],
    isOnboarded: true,
    availability: [
      { start: '18:30', end: '21:30' },
      { start: '10:00', end: '13:00' },
    ],
  },
  {
    id: id(12),
    email: 'lena@convene.demo',
    name: 'Lena Novak',
    age: 39,
    cityKey: vancouverKey,
    phone: '+16045550203',
    interests: ['art', 'pottery', 'crafts', 'coffee'],
    answers: answers(
      'Studio time in the morning and a walk to a cafe when my hands need a rest.',
      'Making something alongside people is far easier for me than talking first.',
      'A group pottery session where we all leave with something slightly lopsided.',
    ),
    memories: [
      memory(
        'making things together',
        'Connects through hands-on creative activities.',
        'Making something alongside people is far easier for me than talking first',
        { social_style: 'hands on', setting: 'studios' },
      ),
    ],
    isOnboarded: true,
    availability: [
      { start: '18:00', end: '20:30' },
      { start: '10:30', end: '13:30' },
    ],
  },
]

export const seedFriendships = { maya: id(1), ben: id(2), chloe: id(3), dev: id(4) }
