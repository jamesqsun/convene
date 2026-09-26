import { z } from "zod";

export const interests = [
  "Coffee",
  "Food",
  "Board games",
  "Gaming",
  "Outdoors",
  "Art",
  "Music",
  "Reading",
  "Study",
  "Coding",
] as const;
export const modeSchema = z.enum(["in_person", "online", "either"]);
export type Mode = z.infer<typeof modeSchema>;
export const profileSchema = z
  .object({
    name: z.string().trim().min(1).max(50),
    city: z.string().trim().min(1).max(80),
    timezone: z.string().refine((value) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, "Choose a valid timezone"),
    interests: z.array(z.enum(interests)).min(1).max(10),
    about: z.string().trim().max(1500),
    idealHangout: z.string().trim().max(1000),
    mode: modeSchema,
    budget: z.number().int().min(0).max(100),
    radiusKm: z.number().min(1).max(100),
    location: z
      .object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
      })
      .nullable()
      .optional(),
    novelty: z.number().min(0).max(100),
    platforms: z.array(z.enum(["Discord", "Browser", "PC", "Switch"])).max(4),
    excludedInterests: z.array(z.enum(interests)).max(10),
  })
  .refine(
    (p) => !p.interests.some((i) => p.excludedInterests.includes(i)),
    "An interest cannot also be excluded",
  );
export type Profile = z.infer<typeof profileSchema>;
export type Memory = {
  id: string;
  topic: string;
  summary: string;
  evidence: string;
  confidence: number;
  source: "onboarding" | "feedback";
};
export type Availability = {
  id: string;
  userId: string;
  start: string;
  end: string;
  mode: Mode;
  interests?: string[];
  goals?: ("new" | "friends")[];
  status?: "pending" | "filled" | "paused" | "expired" | "cancelled";
  revision?: number;
  hangoutId?: string | null;
};
export type Person = {
  id: string;
  profile: Profile;
  summary: string;
  memories: Memory[];
  embedding?: number[];
  seeded: boolean;
};
export type Connection = {
  userId: string;
  otherId: string;
  status: "friend" | "met" | "blocked" | "declined";
  hangoutCount: number;
};
export type Activity = {
  id: string;
  name: string;
  interest: (typeof interests)[number];
  mode: "in_person" | "online";
  minutes: number;
  cost: number;
  platform?: string;
  venue?: { name: string; area: string; city: string };
  color: string;
};
export type Hangout = {
  id: string;
  participantIds: string[];
  activityId: string;
  start: string;
  end: string;
  status: "scheduled" | "cancelled" | "completed";
  reason: string;
  score: number;
  seededVenue: boolean;
  slotIds?: string[];
};
export type Feedback = {
  id: string;
  hangoutId: string;
  userId: string;
  rating: number;
  meetAgain: boolean;
  comments: string;
};
export type Data = {
  people: Person[];
  availability: Availability[];
  connections: Connection[];
  hangouts: Hangout[];
  feedback: Feedback[];
};
export type PublicPerson = Pick<Person, "id" | "seeded" | "summary"> & {
  name: string;
  interests: string[];
};
export type AppState = {
  mode: "demo" | "supabase";
  userId: string;
  profile: Profile | null;
  summary: string;
  memories: Memory[];
  availability: Availability[];
  people: PublicPerson[];
  connections: Connection[];
  hangouts: Hangout[];
  feedback: Feedback[];
  aiAvailable: boolean;
};

export const availabilityInput = z
  .object({
    start: z.iso.datetime(),
    end: z.iso.datetime(),
    mode: modeSchema.default("either"),
    interests: z.array(z.enum(interests)).max(10).default([]),
    goals: z
      .array(z.enum(["new", "friends"]))
      .max(2)
      .default([]),
  })
  .refine(
    (v) => Date.parse(v.end) - Date.parse(v.start) >= 30 * 60000,
    "Add at least 30 minutes",
  )
  .refine(
    (v) => Date.parse(v.end) - Date.parse(v.start) <= 12 * 3600000,
    "A block can be at most 12 hours",
  );
export const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("profile"), profile: profileSchema }),
  z.object({ action: z.literal("availability"), block: availabilityInput }),
  z.object({ action: z.literal("remove_availability"), id: z.uuid() }),
  z.object({
    action: z.literal("slot_status"),
    id: z.uuid(),
    status: z.enum(["pending", "paused"]),
  }),
  z.object({
    action: z.literal("edit_availability"),
    id: z.uuid(),
    block: availabilityInput,
  }),
  z.object({
    action: z.literal("plan"),
    goal: z.enum(["new", "friends", "either"]),
    mode: modeSchema,
    interest: z.enum(["any", ...interests]),
  }),
  z.object({ action: z.literal("cancel"), id: z.uuid() }),
  z.object({
    action: z.literal("feedback"),
    hangoutId: z.uuid(),
    rating: z.number().int().min(1).max(5),
    meetAgain: z.boolean(),
    comments: z.string().trim().max(1000),
  }),
  z.object({
    action: z.literal("connection"),
    otherId: z.uuid(),
    status: z.enum(["friend", "blocked"]),
  }),
]);
export type Action = z.infer<typeof actionSchema>;
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export function assertAvailabilityDoesNotOverlap(
  slots: Availability[],
  userId: string,
  proposed: { start: string; end: string },
  excludeId?: string,
) {
  if (
    slots.some(
      (slot) =>
        slot.userId === userId &&
        slot.id !== excludeId &&
        ["pending", "paused", "filled"].includes(slot.status ?? "pending") &&
        Date.parse(slot.start) < Date.parse(proposed.end) &&
        Date.parse(proposed.start) < Date.parse(slot.end),
    )
  )
    throw new AppError(
      "availability_overlap",
      "This time overlaps another availability slot. Edit that slot or choose a different time.",
      409,
    );
}
export function publicPerson(person: Person): PublicPerson {
  return {
    id: person.id,
    name: person.profile.name,
    interests: person.profile.interests,
    summary: person.summary,
    seeded: person.seeded,
  };
}

export function makeMemories(profile: Profile): Memory[] {
  return [
    ...profile.interests.map((topic) => ({
      id: crypto.randomUUID(),
      topic,
      summary: `Interested in ${topic.toLowerCase()}.`,
      evidence: `Selected ${topic} during onboarding.`,
      confidence: 0.9,
      source: "onboarding" as const,
    })),
    ...[profile.about, profile.idealHangout].filter(Boolean).map((text, i) => ({
      id: crypto.randomUUID(),
      topic: i ? "Ideal hangout" : "Social preferences",
      summary: text,
      evidence: text,
      confidence: 0.95,
      source: "onboarding" as const,
    })),
  ];
}
