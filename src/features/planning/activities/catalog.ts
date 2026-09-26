import type { Interest } from '@/features/profile/interests'

/**
 * The application-owned catalog of in-person activities. Convene chooses from this list; users
 * never pick, exclude, or configure activities. Durations are the allowed event lengths in minutes.
 */
export interface Activity {
  id: string
  name: string
  description: string
  durationsMinutes: number[]
  tags: Interest[]
  /** Text query handed to the venue provider. */
  placesQuery: string
}

export const activities: readonly Activity[] = [
  {
    id: 'coffee',
    name: 'Coffee and conversation',
    description: 'A relaxed cafe meetup.',
    durationsMinutes: [60, 90],
    tags: ['coffee', 'books', 'writing', 'tech', 'startups', 'languages'],
    placesQuery: 'coffee shop',
  },
  {
    id: 'park_walk',
    name: 'Walk in the park',
    description: 'An easy stroll with room to talk.',
    durationsMinutes: [60, 90],
    tags: ['hiking', 'nature', 'dogs', 'running', 'photography'],
    placesQuery: 'park',
  },
  {
    id: 'board_game_cafe',
    name: 'Board game cafe',
    description: 'Pick a game, order a drink, play a round or two.',
    durationsMinutes: [90, 120],
    tags: ['board games', 'trivia', 'video games'],
    placesQuery: 'board game cafe',
  },
  {
    id: 'museum_visit',
    name: 'Museum visit',
    description: 'Wander an exhibition together.',
    durationsMinutes: [90, 120, 180],
    tags: ['museums', 'art', 'history', 'photography'],
    placesQuery: 'museum',
  },
  {
    id: 'casual_dinner',
    name: 'Casual dinner',
    description: 'A low-key meal at a neighbourhood spot.',
    durationsMinutes: [90, 120],
    tags: ['food', 'cooking', 'baking', 'travel'],
    placesQuery: 'casual restaurant',
  },
  {
    id: 'bouldering',
    name: 'Bouldering session',
    description: 'Beginner-friendly climbing, no ropes.',
    durationsMinutes: [90, 120],
    tags: ['climbing', 'sports', 'yoga'],
    placesQuery: 'bouldering gym',
  },
  {
    id: 'bowling',
    name: 'Bowling',
    description: 'A couple of games, no skill required.',
    durationsMinutes: [60, 90],
    tags: ['sports', 'basketball', 'soccer', 'comedy'],
    placesQuery: 'bowling alley',
  },
  {
    id: 'market_stroll',
    name: 'Market stroll',
    description: 'Browse stalls and snack along the way.',
    durationsMinutes: [60, 90],
    tags: ['markets', 'food', 'crafts', 'baking'],
    placesQuery: 'public market',
  },
  {
    id: 'trivia_night',
    name: 'Pub trivia',
    description: 'Team up for a quiz night.',
    durationsMinutes: [120],
    tags: ['trivia', 'comedy', 'film', 'music'],
    placesQuery: 'pub trivia night',
  },
  {
    id: 'pottery_class',
    name: 'Pottery drop-in',
    description: 'Get your hands muddy at a studio session.',
    durationsMinutes: [120],
    tags: ['pottery', 'crafts', 'art'],
    placesQuery: 'pottery studio',
  },
  {
    id: 'live_music',
    name: 'Live music',
    description: 'Catch a local set.',
    durationsMinutes: [120, 180],
    tags: ['live music', 'music', 'dance', 'theatre'],
    placesQuery: 'live music venue',
  },
  {
    id: 'mini_golf',
    name: 'Mini golf',
    description: 'Eighteen tiny holes of friendly rivalry.',
    durationsMinutes: [60, 90],
    tags: ['sports', 'comedy', 'video games', 'volunteering'],
    placesQuery: 'mini golf',
  },
]

const byId = new Map(activities.map((activity) => [activity.id, activity]))

export function activityById(id: string): Activity | undefined {
  return byId.get(id)
}
