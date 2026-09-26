import test from "node:test";
import assert from "node:assert/strict";
import { defaultProfile, seedData } from "../src/lib/catalog";
import {
  actionSchema,
  profileSchema,
  type Data,
  type Mode,
} from "../src/lib/domain";
import { cosine, plan, subtractBusy } from "../src/lib/planner";

const userId = "10000000-0000-4000-8000-000000000001";
const now = Date.parse("2026-09-24T08:00:00Z");
const request = {
  goal: "new" as const,
  mode: "either" as Mode,
  interest: "any",
};
function fixture(): Data {
  const data = seedData(new Date(now));
  data.people.push({
    id: userId,
    profile: {
      ...defaultProfile,
      name: "Test",
      interests: ["Coffee", "Board games", "Music"],
    },
    summary: "Test",
    memories: [],
    seeded: false,
  });
  data.availability.push({
    id: crypto.randomUUID(),
    userId,
    start: "2026-09-25T15:00:00Z",
    end: "2026-09-25T20:00:00Z",
    mode: "either",
  });
  return data;
}
test("subtracting busy time preserves both usable sides and adjacent slots", () => {
  assert.deepEqual(
    subtractBusy([{ start: 0, end: 100 }], [{ start: 30, end: 70 }]),
    [
      { start: 0, end: 30 },
      { start: 70, end: 100 },
    ],
  );
  assert.deepEqual(
    subtractBusy([{ start: 0, end: 30 }], [{ start: 30, end: 70 }]),
    [{ start: 0, end: 30 }],
  );
});
test("a plan is contained inside shared availability", () => {
  const data = fixture();
  const h = plan(data, userId, request, now, () => 0);
  for (const id of h.participantIds)
    assert.ok(
      data.availability.some(
        (a) =>
          a.userId === id &&
          Date.parse(a.start) <= Date.parse(h.start) &&
          Date.parse(a.end) >= Date.parse(h.end),
      ),
    );
  assert.equal(h.participantIds.length, 2);
  assert.ok(h.reason.includes("both enjoy"));
});
test("planning twice does not double book either participant", () => {
  const data = fixture();
  const first = plan(data, userId, request, now, () => 0);
  data.hangouts.push(first);
  const second = plan(data, userId, request, now, () => 0);
  assert.ok(
    Date.parse(second.start) >= Date.parse(first.end) ||
      Date.parse(second.end) <= Date.parse(first.start),
  );
});
test("no overlap produces a useful error instead of a fabricated plan", () => {
  const data = fixture();
  data.availability = data.availability.filter((a) => a.userId !== userId);
  assert.throws(() => plan(data, userId, request, now), /No plan fits/);
});
test("blocked and declined connections in either direction never match", () => {
  const data = fixture();
  data.connections = data.people
    .filter((p) => p.id !== userId)
    .map((p) => ({
      userId: p.id,
      otherId: userId,
      status: "declined",
      hangoutCount: 1,
    }));
  assert.throws(() => plan(data, userId, request, now), /No plan fits/);
});
test("online-only availability cannot produce an in-person plan", () => {
  const data = fixture();
  data.availability
    .filter((a) => a.userId === userId)
    .forEach((a) => (a.mode = "online"));
  assert.throws(
    () => plan(data, userId, { ...request, mode: "in_person" }, now),
    /No plan fits/,
  );
  assert.equal(
    plan(data, userId, { ...request, mode: "online" }, now, () => 0)
      .seededVenue,
    false,
  );
});
test("required online platform and budgets are hard filters", () => {
  const data = fixture();
  const me = data.people.find((p) => p.id === userId)!;
  me.profile.platforms = [];
  me.profile.budget = 0;
  assert.throws(() => plan(data, userId, request, now), /No plan fits/);
});
test("explicit exclusions cannot be overridden by shared interests", () => {
  const data = fixture();
  data.people.find((p) => p.id === userId)!.profile.excludedInterests = [
    "Coffee",
    "Board games",
    "Music",
  ];
  assert.throws(() => plan(data, userId, request, now), /No plan fits/);
});
test("in-person catalog is limited to the seeded city, online works elsewhere", () => {
  const data = fixture();
  data.people.find((p) => p.id === userId)!.profile.city = "Seattle";
  assert.throws(
    () => plan(data, userId, { ...request, mode: "in_person" }, now),
    /No plan fits/,
  );
  assert.equal(plan(data, userId, request, now, () => 0).seededVenue, false);
});
test("friend requests use saved friends; new-person requests exclude them", () => {
  const data = fixture();
  const id = data.people[0].id;
  data.connections.push({
    userId,
    otherId: id,
    status: "friend",
    hangoutCount: 1,
  });
  assert.ok(
    plan(
      data,
      userId,
      { ...request, goal: "friends" },
      now,
      () => 0,
    ).participantIds.includes(id),
  );
  assert.ok(
    !plan(data, userId, request, now, () => 0).participantIds.includes(id),
  );
});
test("cancellation makes time available again", () => {
  const data = fixture();
  const h = plan(data, userId, request, now, () => 0);
  h.status = "cancelled";
  data.hangouts.push(h);
  assert.equal(plan(data, userId, request, now, () => 0).start, h.start);
});
test("short blocks are not stretched to fit an activity", () => {
  const data = fixture();
  data.availability.find((a) => a.userId === userId)!.end =
    "2026-09-25T15:30:00Z";
  assert.throws(() => plan(data, userId, request, now), /No plan fits/);
});
test("timezone offsets describe the same absolute slot", () => {
  const data = fixture();
  const block = data.availability.find((a) => a.userId === userId)!;
  block.start = "2026-09-25T08:00:00-07:00";
  block.end = "2026-09-25T13:00:00-07:00";
  assert.equal(
    plan(data, userId, request, now, () => 0).start,
    "2026-09-25T15:00:00.000Z",
  );
});
test("feedback gently changes activity preference without creating a hard exclusion", () => {
  const data = fixture();
  const h = plan(data, userId, request, now, () => 0);
  data.hangouts.push({ ...h, status: "completed" });
  data.feedback.push({
    id: crypto.randomUUID(),
    userId,
    hangoutId: h.id,
    rating: 1,
    meetAgain: true,
    comments: "Not this activity today",
  });
  const next = plan(data, userId, { ...request, goal: "either" }, now, () => 0);
  assert.notEqual(next.activityId, h.activityId);
});
test("schema rejects impossible ranges and contradictory preferences", () => {
  assert.equal(
    actionSchema.safeParse({
      action: "availability",
      block: {
        start: "2026-09-25T16:00:00Z",
        end: "2026-09-25T15:00:00Z",
        mode: "either",
      },
    }).success,
    false,
  );
  assert.equal(
    profileSchema.safeParse({
      ...defaultProfile,
      name: "Test",
      excludedInterests: ["Coffee"],
    }).success,
    false,
  );
  assert.equal(
    profileSchema.safeParse({
      ...defaultProfile,
      name: "Test",
      timezone: "Not/AZone",
    }).success,
    false,
  );
});
test("cosine handles absent, mismatched, and zero vectors", () => {
  assert.equal(cosine(undefined, []), 0);
  assert.equal(cosine([0, 0], [0, 0]), 0);
  assert.equal(cosine([1], [1, 2]), 0);
  assert.equal(cosine([1, 0], [1, 0]), 1);
});
