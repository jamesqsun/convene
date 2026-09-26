import assert from "node:assert/strict";
const base = process.env.CONVENE_TEST_URL || "http://localhost:3000";
function client() {
  let cookie = "";
  return async (path, body, extraHeaders = {}) => {
    const response = await fetch(`${base}${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body ? { "Content-Type": "application/json", Origin: base } : {}),
        ...extraHeaders,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (response.headers.get("set-cookie"))
      cookie = response.headers.get("set-cookie").split(";")[0];
    return { response, body: await response.json() };
  };
}
const a = client();
const b = client();
let result = await a("/api/state");
assert.equal(
  result.body.mode,
  "demo",
  "Smoke tests require CONVENE_MODE=demo; refusing to change connected data.",
);
assert.equal(result.body.profile, null);
const id = result.body.userId;
assert.match(result.response.headers.get("cache-control"), /no-store/);
const other = await b("/api/state");
assert.notEqual(other.body.userId, id);
const profile = {
  name: "Smoke Test",
  city: "Atlanta",
  timezone: "America/New_York",
  interests: ["Coffee", "Board games", "Music"],
  about: "I prefer a quiet setting",
  idealHangout: "Casual games",
  mode: "either",
  budget: 25,
  radiusKm: 10,
  novelty: 45,
  platforms: ["Discord", "Browser"],
  excludedInterests: [],
};
result = await a("/api/action", { action: "profile", profile });
assert.equal(result.response.status, 200, JSON.stringify(result.body));
assert.ok(result.body.state.memories.length);
assert.ok(!result.body.state.summary.includes("quiet setting"));
const sample = result.body.state.hangouts[0];
const start = new Date();
start.setUTCDate(start.getUTCDate() + 1);
start.setUTCHours(15, 0, 0, 0);
const end = new Date(start.getTime() + 5 * 3600000);
result = await a("/api/action", {
  action: "availability",
  block: { start: start.toISOString(), end: end.toISOString(), mode: "either" },
});
assert.equal(result.response.status, 200, JSON.stringify(result.body));
const request = {
  action: "plan",
  goal: "new",
  mode: "in_person",
  interest: "Coffee",
};
result = await a("/api/state");
const plans = result.body.hangouts.filter((h) => h.status === "scheduled");
assert.equal(
  plans.length,
  1,
  "Saving availability automatically assigns one event.",
);
const slot = result.body.availability.find((s) => s.hangoutId === plans[0].id);
assert.equal(slot.status, "filled");
const duplicateSlot = await a("/api/action", {
  action: "availability",
  block: { start: start.toISOString(), end: end.toISOString(), mode: "online" },
});
assert.equal(duplicateSlot.response.status, 409);
assert.equal(duplicateSlot.body.code, "availability_overlap");
const adjacentSlot = await a("/api/action", {
  action: "availability",
  block: {
    start: end.toISOString(),
    end: new Date(end.getTime() + 3600000).toISOString(),
    mode: "either",
    goals: ["friends"],
  },
});
assert.equal(adjacentSlot.response.status, 200);
const adjacent = adjacentSlot.body.state.availability.find(
  (s) => s.start === end.toISOString(),
);
const overlappingEdit = await a("/api/action", {
  action: "edit_availability",
  id: adjacent.id,
  block: { start: start.toISOString(), end: end.toISOString(), mode: "either" },
});
assert.equal(overlappingEdit.response.status, 409);
assert.equal(overlappingEdit.body.code, "availability_overlap");
await Promise.all([a("/api/state"), a("/api/state")]);
result = await a("/api/state");
assert.equal(
  result.body.hangouts.filter((h) => h.status === "scheduled").length,
  1,
);
const manual = await a("/api/action", request);
assert.equal(
  manual.response.status,
  410,
  "Manual planning has been replaced by automatic slots.",
);
assert.ok(
  result.body.people.every(
    (p) => !("profile" in p) && !("memories" in p) && !("embedding" in p),
  ),
);
result = await b("/api/action", {
  action: "profile",
  profile: { ...profile, name: "Other User" },
});
assert.equal(result.response.status, 200);
result = await b("/api/action", { action: "cancel", id: plans[0].id });
assert.equal(
  result.response.status,
  404,
  "Another session cannot cancel a plan.",
);
result = await a("/api/action", {
  action: "feedback",
  hangoutId: plans[0].id,
  rating: 4,
  meetAgain: true,
  comments: "Too early",
});
assert.equal(result.response.status, 409);
result = await a("/api/action", {
  action: "feedback",
  hangoutId: sample.id,
  rating: 4,
  meetAgain: false,
  comments: "I would prefer a quieter setting next time.",
});
assert.equal(result.response.status, 200, JSON.stringify(result.body));
assert.ok(result.body.state.memories.some((m) => m.source === "feedback"));
result = await a("/api/action", {
  action: "feedback",
  hangoutId: sample.id,
  rating: 4,
  meetAgain: true,
  comments: "Duplicate",
});
assert.equal(result.response.status, 409);
result = await a("/api/action", { action: "cancel", id: plans[0].id });
assert.equal(result.response.status, 200);
assert.equal(
  result.body.state.availability.find((s) => s.id === slot.id).status,
  "cancelled",
);
assert.equal(
  result.body.state.hangouts.filter((h) => h.status === "scheduled").length,
  0,
  "Cancelling must not immediately create another plan.",
);
result = await a("/api/action", {
  action: "availability",
  block: {
    start: start.toISOString(),
    end: end.toISOString(),
    mode: "online",
    interests: ["Music"],
    goals: [],
  },
});
assert.equal(result.response.status, 200, JSON.stringify(result.body));
assert.ok(result.body.state.hangouts.some((h) => !h.seededVenue));
result = await a("/api/action", {
  action: "availability",
  block: { start: end.toISOString(), end: start.toISOString(), mode: "either" },
});
assert.equal(result.response.status, 400);
result = await a("/api/action", request, {
  Origin: "https://not-convene.example",
});
assert.equal(result.response.status, 403);
result = await b("/api/state");
assert.equal(
  result.body.feedback.length,
  0,
  "Feedback must stay inside its own session.",
);
console.log(
  "API smoke checks passed: onboarding, session isolation, privacy, automatic slot assignment, both modes, cancellation, feedback, and invalid/cross-origin requests.",
);
