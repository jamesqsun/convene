import type { Activity, Data, Person, Profile } from "./domain";

// Fictional venues are intentionally labeled in every generated in-person plan.
export const activities: Activity[] = [
  {
    id: "coffee",
    name: "Coffee & a good conversation",
    interest: "Coffee",
    mode: "in_person",
    minutes: 60,
    cost: 8,
    venue: { name: "Sunday Coffee", area: "Midtown", city: "Atlanta" },
    color: "peach",
  },
  {
    id: "board-games",
    name: "A little friendly competition",
    interest: "Board games",
    mode: "in_person",
    minutes: 90,
    cost: 15,
    venue: { name: "The Board Room", area: "Midtown", city: "Atlanta" },
    color: "lavender",
  },
  {
    id: "food",
    name: "Find your next favorite bite",
    interest: "Food",
    mode: "in_person",
    minutes: 90,
    cost: 20,
    venue: { name: "Little Table", area: "Midtown", city: "Atlanta" },
    color: "peach",
  },
  {
    id: "walk",
    name: "Fresh air, new perspective",
    interest: "Outdoors",
    mode: "in_person",
    minutes: 60,
    cost: 0,
    venue: {
      name: "Demo neighborhood greenway",
      area: "Midtown",
      city: "Atlanta",
    },
    color: "sage",
  },
  {
    id: "gallery",
    name: "An afternoon of art",
    interest: "Art",
    mode: "in_person",
    minutes: 60,
    cost: 10,
    venue: { name: "Common Ground Gallery", area: "Midtown", city: "Atlanta" },
    color: "lavender",
  },
  {
    id: "gaming",
    name: "Co-op, conversation & company",
    interest: "Gaming",
    mode: "online",
    minutes: 90,
    cost: 0,
    tool: "Choose a co-op game together",
    color: "lavender",
  },
  {
    id: "music",
    name: "Trade your favorite tracks",
    interest: "Music",
    mode: "online",
    minutes: 60,
    cost: 0,
    tool: "Your preferred music service",
    color: "peach",
  },
  {
    id: "study",
    name: "A study session with company",
    interest: "Study",
    mode: "online",
    minutes: 60,
    cost: 0,
    tool: "Your study materials",
    color: "sage",
  },
  {
    id: "coding",
    name: "Build something small together",
    interest: "Coding",
    mode: "online",
    minutes: 90,
    cost: 0,
    tool: "Your preferred coding tools",
    color: "sage",
  },
  {
    id: "reading",
    name: "Books, stories & a new friend",
    interest: "Reading",
    mode: "online",
    minutes: 60,
    cost: 0,
    tool: "Bring a book to discuss",
    color: "peach",
  },
  {
    id: "online-games",
    name: "An online board-game break",
    interest: "Board games",
    mode: "online",
    minutes: 60,
    cost: 0,
    tool: "Browser-based board games",
    color: "lavender",
  },
];
export const defaultProfile: Profile = {
  name: "",
  city: "Atlanta",
  timezone: "America/New_York",
  interests: ["Coffee", "Board games", "Music"],
  about: "",
  idealHangout: "",
  mode: "either",
  budget: 25,
  radiusKm: 10,
  novelty: 45,
  phone: "",
  platforms: ["Phone"],
  handles: {},
  excludedInterests: [],
};
const seeds: [string, Profile["interests"], string][] = [
  [
    "Alex",
    ["Coffee", "Board games", "Gaming", "Music"],
    "Casual games, good coffee, and conversations that go somewhere.",
  ],
  [
    "Jordan",
    ["Food", "Outdoors", "Music"],
    "Always up for a new food spot or a slow weekend walk.",
  ],
  [
    "Maya",
    ["Art", "Coffee", "Reading"],
    "Gallery afternoons, good books, and quieter corners of the city.",
  ],
  [
    "Sam",
    ["Gaming", "Coding", "Board games"],
    "Cooperative games and creative side projects. Here for the fun.",
  ],
  [
    "Riley",
    ["Outdoors", "Coffee", "Food"],
    "Fresh air first. Usually followed by something delicious.",
  ],
  [
    "Jamie",
    ["Music", "Art", "Food"],
    "Making playlists and finding new creative things to try.",
  ],
  [
    "Taylor",
    ["Study", "Coding", "Coffee"],
    "A little focus, a little conversation, and a coffee break.",
  ],
  [
    "Casey",
    ["Reading", "Board games", "Study"],
    "A book recommender with a very competitive Scrabble streak.",
  ],
  [
    "Morgan",
    ["Gaming", "Music", "Coding"],
    "Online co-op nights and sharing underrated albums.",
  ],
  [
    "Avery",
    ["Outdoors", "Art", "Reading"],
    "Slow walks, sketchbooks, and interesting stories.",
  ],
];
export function seedPeople(): Person[] {
  return seeds.map(([name, interests, summary], i) => ({
    id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    profile: {
      ...defaultProfile,
      location: { latitude: 33.783, longitude: -84.383 },
      name,
      phone: `+120255501${String(i + 10).padStart(2, "0")}`,
      platforms: ["Phone", "Discord", "WhatsApp", "Instagram", "Telegram"],
      handles: {
        Discord: `convene_demo_${i + 1}`,
        WhatsApp: `+120255501${String(i + 10).padStart(2, "0")}`,
        Instagram: `convene_demo_${i + 1}`,
        Telegram: `convene_demo_${i + 1}`,
      },
      interests,
      about: summary,
      novelty: 30 + i * 5,
    },
    summary,
    memories: [],
    seeded: true,
  }));
}
export function seedData(now = new Date()): Data {
  const people = seedPeople();
  const availability = people.flatMap((p, index) =>
    Array.from({ length: 14 }, (_, day) => {
      const start = new Date(now);
      start.setUTCDate(start.getUTCDate() + day);
      start.setUTCHours(12 + (index % 2), 0, 0, 0);
      const end = new Date(start);
      end.setUTCHours(23, 59, 0, 0);
      return {
        id: crypto.randomUUID(),
        userId: p.id,
        start: start.toISOString(),
        end: end.toISOString(),
        mode: "either" as const,
      };
    }),
  );
  return { people, availability, connections: [], hangouts: [], feedback: [] };
}
