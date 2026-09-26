/**
 * The public interest vocabulary. Interests are the only profile facts shared with other
 * participants and the only ones used in plan explanations. Activity catalog tags draw from this list.
 */
export const interests = [
  'coffee',
  'food',
  'cooking',
  'baking',
  'hiking',
  'running',
  'cycling',
  'climbing',
  'yoga',
  'board games',
  'video games',
  'trivia',
  'music',
  'live music',
  'art',
  'museums',
  'photography',
  'film',
  'books',
  'writing',
  'theatre',
  'dance',
  'crafts',
  'pottery',
  'markets',
  'travel',
  'languages',
  'tech',
  'startups',
  'volunteering',
  'dogs',
  'nature',
  'sports',
  'basketball',
  'soccer',
  'history',
  'comedy',
] as const

export type Interest = (typeof interests)[number]

export const maxInterests = 10

const interestSet: ReadonlySet<string> = new Set(interests)

export function isInterest(value: string): value is Interest {
  return interestSet.has(value)
}
