import test from "node:test";
import assert from "node:assert/strict";
import { defaultProfile } from "../src/lib/catalog";
import {
  profileSchema,
  publicPerson,
  makeMemories,
  type Data,
  type Profile,
} from "../src/lib/domain";
import {
  contactValue,
  sharedCommunication,
  planContactsFor,
} from "../src/lib/contacts";

const profile: Profile = {
  ...defaultProfile,
  name: "Test",
  phone: "+12025550123",
  platforms: ["Phone", "Discord", "WhatsApp"],
  handles: { Discord: "test_user", WhatsApp: "+12025550123" },
};
function fixture(): Data {
  return {
    people: ["alice", "bob", "outsider"].map((id) => ({
      id,
      profile: { ...profile, name: id },
      summary: "Shared interests",
      memories: [],
      seeded: false,
    })),
    availability: [],
    connections: [],
    feedback: [],
    hangouts: [
      {
        id: "event",
        participantIds: ["alice", "bob"],
        activityId: "music",
        start: "2026-10-01T15:00:00Z",
        end: "2026-10-01T16:00:00Z",
        status: "scheduled",
        reason: "Shared interests",
        score: 90,
        seededVenue: false,
        communicationPlatform: "Discord",
      },
    ],
  };
}
test("phone is required and normalized; each selected app requires its own identifier", () => {
  assert.equal(
    profileSchema.safeParse({ ...profile, phone: "" }).success,
    false,
  );
  assert.equal(
    profileSchema.safeParse({ ...profile, phone: "2025550123" }).success,
    false,
  );
  assert.equal(
    profileSchema.safeParse({ ...profile, handles: {} }).success,
    false,
  );
  assert.equal(
    profileSchema.safeParse({
      ...profile,
      handles: { Discord: "https://example.com/user", WhatsApp: profile.phone },
    }).success,
    false,
  );
  const saved = profileSchema.parse({
    ...profile,
    phone: "+1 (202) 555-0123",
    handles: { Discord: "@test_user", WhatsApp: "+1 202 555 0123" },
  });
  assert.equal(saved.phone, "+12025550123");
  assert.equal(saved.handles.Discord, "test_user");
  assert.equal(saved.handles.WhatsApp, saved.phone);
});
test("deselected identifiers are discarded and cannot become a fallback contact", () => {
  const saved = profileSchema.parse({ ...profile, platforms: ["Phone"] });
  assert.deepEqual(saved.handles, {});
  assert.equal(contactValue(saved, "Discord"), undefined);
  const discordOnly = {
    ...profile,
    platforms: ["Discord"] as Profile["platforms"],
  };
  assert.equal(sharedCommunication(saved, discordOnly), undefined);
  assert.equal(sharedCommunication(profile, discordOnly), "Discord");
  assert.equal(sharedCommunication(saved, profile), "Phone");
});
test("only assigned participants get the chosen contact, never all stored identifiers", () => {
  const data = fixture();
  assert.deepEqual(planContactsFor(data, "alice"), [
    {
      hangoutId: "event",
      userId: "bob",
      platform: "Discord",
      value: "test_user",
      seeded: false,
    },
  ]);
  assert.deepEqual(planContactsFor(data, "outsider"), []);
  assert.ok(
    !JSON.stringify(planContactsFor(data, "alice")).includes(profile.phone),
  );
  assert.ok(
    !JSON.stringify(publicPerson(data.people[1])).includes("test_user"),
  );
  assert.ok(!JSON.stringify(makeMemories(profile)).includes(profile.phone));
});
test("cancellation, blocking in either direction, and disabling a method revoke further display", () => {
  for (const [userId, otherId] of [
    ["alice", "bob"],
    ["bob", "alice"],
  ]) {
    const data = fixture();
    data.connections.push({
      userId,
      otherId,
      status: "blocked",
      hangoutCount: 1,
    });
    assert.deepEqual(planContactsFor(data, "alice"), []);
  }
  const cancelled = fixture();
  cancelled.hangouts[0].status = "cancelled";
  assert.deepEqual(planContactsFor(cancelled, "alice"), []);
  const disabled = fixture();
  disabled.people[1].profile.platforms = ["Phone"];
  assert.deepEqual(planContactsFor(disabled, "alice"), []);
});
test("legacy profiles without contact information cannot be matched by assuming a platform", () => {
  const legacy = {
    ...profile,
    phone: "",
    handles: {},
    platforms: ["Discord"] as Profile["platforms"],
  };
  assert.equal(sharedCommunication(profile, legacy), undefined);
});
