import { activities } from "./catalog";
import {
  AppError,
  type Activity,
  type Data,
  type Hangout,
  type Mode,
  type Person,
} from "./domain";

type Window = { start: number; end: number };
export const overlaps = (a: Window, b: Window) =>
  a.start < b.end && b.start < a.end;
export const allows = (constraint: Mode, mode: Mode) =>
  constraint === "either" || mode === "either" || constraint === mode;
export function subtractBusy(windows: Window[], busy: Window[]): Window[] {
  return busy.reduce(
    (available, conflict) =>
      available.flatMap((w) =>
        !overlaps(w, conflict)
          ? [w]
          : [
              { start: w.start, end: Math.min(w.end, conflict.start) },
              { start: Math.max(w.start, conflict.end), end: w.end },
            ].filter((w) => w.end > w.start),
      ),
    windows,
  );
}
export function cosine(a?: number[], b?: number[]): number {
  if (!a?.length || a.length !== b?.length) return 0;
  const norm = Math.sqrt(
    a.reduce((s, n) => s + n * n, 0) * b.reduce((s, n) => s + n * n, 0),
  );
  return norm ? Math.max(0, a.reduce((s, n, i) => s + n * b[i], 0) / norm) : 0;
}
function validActivity(
  activity: Activity,
  a: Person,
  b: Person,
  mode: Mode,
  interest: string,
) {
  return (
    allows(mode, activity.mode) &&
    [a, b].every(
      (p) =>
        allows(p.profile.mode, activity.mode) &&
        !p.profile.excludedInterests.includes(activity.interest) &&
        p.profile.budget >= activity.cost &&
        (!activity.platform ||
          p.profile.platforms.includes(activity.platform as "Discord")) &&
        // The MVP has no geocoding. In-person matching stays within the seeded city;
        // no distance or travel-time guarantee is implied.
        (activity.mode === "online" ||
          p.profile.city.trim().toLowerCase() ===
            activity.venue?.city.toLowerCase()),
    ) &&
    (interest === "any" || activity.interest === interest) &&
    a.profile.interests.includes(activity.interest) &&
    b.profile.interests.includes(activity.interest)
  );
}
export function plan(
  data: Data,
  userId: string,
  request: { goal: "new" | "friends" | "either"; mode: Mode; interest: string },
  now = Date.now(),
  random = Math.random,
): Hangout {
  const me = data.people.find((p) => p.id === userId);
  if (!me)
    throw new AppError(
      "profile_required",
      "Tell Convene a little about yourself first.",
    );
  const earliest = Math.ceil((now + 60000) / (15 * 60000)) * 15 * 60000;
  const windows = (id: string, mode: Mode) =>
    subtractBusy(
      data.availability
        .filter((b) => b.userId === id && allows(b.mode, mode))
        .map((b) => ({
          start: Math.max(Date.parse(b.start), earliest),
          end: Date.parse(b.end),
        }))
        .filter((w) => w.end > w.start),
      data.hangouts
        .filter(
          (h) => h.status === "scheduled" && h.participantIds.includes(id),
        )
        .map((h) => ({ start: Date.parse(h.start), end: Date.parse(h.end) })),
    );
  const options: {
    person: Person;
    activity: Activity;
    start: number;
    score: number;
    shared: string[];
  }[] = [];
  for (const person of data.people) {
    if (person.id === userId) continue;
    const relations = data.connections.filter(
      (c) =>
        (c.userId === userId && c.otherId === person.id) ||
        (c.otherId === userId && c.userId === person.id),
    );
    if (relations.some((c) => ["blocked", "declined"].includes(c.status)))
      continue;
    const known =
      relations.some((c) => ["friend", "met"].includes(c.status)) ||
      data.hangouts.some(
        (h) =>
          h.status !== "cancelled" &&
          h.participantIds.includes(userId) &&
          h.participantIds.includes(person.id),
      );
    if (
      (request.goal === "new" && known) ||
      (request.goal === "friends" &&
        !relations.some((c) => c.userId === userId && c.status === "friend"))
    )
      continue;
    for (const activity of activities.filter((a) =>
      validActivity(a, me, person, request.mode, request.interest),
    )) {
      const slots = windows(userId, activity.mode)
        .flatMap((a) =>
          windows(person.id, activity.mode).map((b) => ({
            start: Math.max(a.start, b.start),
            end: Math.min(a.end, b.end),
          })),
        )
        .filter((w) => w.end - w.start >= activity.minutes * 60000)
        .sort((a, b) => a.start - b.start);
      if (!slots.length) continue;
      const shared = me.profile.interests.filter((i) =>
        person.profile.interests.includes(i),
      );
      const fit = shared.length / Math.max(1, me.profile.interests.length);
      const relevantFeedback = data.feedback.filter(
        (f) =>
          f.userId === userId &&
          data.hangouts.some(
            (h) => h.id === f.hangoutId && h.activityId === activity.id,
          ),
      );
      const feedbackFit = relevantFeedback.length
        ? relevantFeedback.reduce((sum, f) => sum + (f.rating - 3) / 2, 0) /
          relevantFeedback.length
        : 0;
      const score = Math.min(
        0.98,
        Math.max(
          0.1,
          0.55 +
            fit * 0.3 +
            cosine(me.embedding, person.embedding) * 0.1 +
            feedbackFit * 0.05 +
            (known ? 0.03 : 0),
        ),
      );
      options.push({ person, activity, start: slots[0].start, score, shared });
    }
  }
  if (!options.length)
    throw new AppError(
      "no_viable_plan",
      "No plan fits all your preferences and free time yet. Try a longer time block, another activity, or online hangouts.",
      422,
    );
  // One best activity per person prevents people with many activities dominating the lottery.
  const unique = new Map<string, (typeof options)[number]>();
  for (const option of options.sort(
    (a, b) => b.score - a.score || a.start - b.start,
  ))
    if (!unique.has(option.person.id)) unique.set(option.person.id, option);
  const pool = [...unique.values()].slice(
    0,
    3 + Math.round((me.profile.novelty / 100) * 7),
  );
  let draw = random() * pool.reduce((s, p) => s + p.score, 0);
  const chosen =
    pool.find((p) => (draw -= p.score) <= 0) ?? pool[pool.length - 1];
  return {
    id: crypto.randomUUID(),
    participantIds: [userId, chosen.person.id],
    activityId: chosen.activity.id,
    start: new Date(chosen.start).toISOString(),
    end: new Date(chosen.start + chosen.activity.minutes * 60000).toISOString(),
    status: "scheduled",
    score: Math.round(chosen.score * 100),
    seededVenue: chosen.activity.mode === "in_person",
    reason: `You both enjoy ${chosen.shared.slice(0, 3).join(", ").toLowerCase()}, and have ${chosen.activity.minutes} minutes free together. This ${chosen.activity.mode === "online" ? "online session" : "activity"} fits both of your budgets and activity preferences.`,
  };
}
