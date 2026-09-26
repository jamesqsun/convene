import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { defaultProfile } from "../src/lib/catalog";
import { distanceKm, fillPendingSlots, plan } from "../src/lib/planner";
import { type Data, actionSchema } from "../src/lib/domain";

const alice = "10000000-0000-4000-8000-000000000001";
const bob = "10000000-0000-4000-8000-000000000002";
const now = Date.now();
const start = new Date(now + 86400000).toISOString();
const end = new Date(now + 86400000 + 5 * 3600000).toISOString();
const profile = {
  ...defaultProfile,
  interests: ["Coffee", "Board games"] as typeof defaultProfile.interests,
};
function fixture(): Data {
  return {
    people: [alice, bob].map((id) => ({
      id,
      profile,
      summary: "",
      memories: [],
      seeded: false,
    })),
    availability: [],
    connections: [],
    hangouts: [],
    feedback: [],
  };
}
test("a slot waits for a later compatible slot; one event fills both once", () => {
  const data = fixture();
  data.availability.push({
    id: crypto.randomUUID(),
    userId: alice,
    start,
    end,
    mode: "either",
    interests: ["Coffee", "Board games"],
    status: "pending",
  });
  fillPendingSlots(data, now);
  assert.equal(data.hangouts.length, 0);
  data.availability.push({
    id: crypto.randomUUID(),
    userId: bob,
    start,
    end,
    mode: "in_person",
    interests: ["Coffee"],
    status: "pending",
  });
  fillPendingSlots(data, now);
  assert.equal(data.hangouts.length, 1);
  assert.equal(data.hangouts[0].activityId, "coffee");
  assert.ok(data.availability.every((s) => s.status === "filled"));
  fillPendingSlots(data, now);
  assert.equal(data.hangouts.length, 1);
});
test("mutual activity and connection choices, paused slots, and expiration are respected", () => {
  const data = fixture();
  data.availability = [
    {
      id: crypto.randomUUID(),
      userId: alice,
      start,
      end,
      mode: "either",
      interests: ["Coffee"],
    },
    {
      id: crypto.randomUUID(),
      userId: bob,
      start,
      end,
      mode: "either",
      interests: ["Board games"],
    },
  ];
  fillPendingSlots(data, now);
  assert.equal(data.hangouts.length, 0);
  data.availability[1].interests = [];
  data.availability[1].goals = ["friends"];
  fillPendingSlots(data, now);
  assert.equal(data.hangouts.length, 0);
  data.availability[1].goals = [];
  data.availability[1].status = "paused";
  fillPendingSlots(data, now);
  assert.equal(data.hangouts.length, 0);
  data.availability[1].status = "pending";
  fillPendingSlots(data, Date.parse(end) + 1);
  assert.ok(data.availability.every((s) => s.status === "expired"));
});
test("slot defaults are unrestricted and selected activities never bypass exclusions", () => {
  const parsed = actionSchema.parse({
    action: "availability",
    block: { start, end },
  });
  assert.equal(parsed.action, "availability");
  if (parsed.action !== "availability") return;
  assert.deepEqual(parsed.block, {
    start,
    end,
    mode: "either",
    interests: [],
    goals: [],
  });
  const data = fixture();
  data.people[1].profile = { ...profile, excludedInterests: ["Coffee"] };
  data.availability = [alice, bob].map((userId) => ({
    id: crypto.randomUUID(),
    userId,
    start,
    end,
    mode: "either",
    interests: ["Coffee"],
  }));
  assert.throws(
    () =>
      plan(
        data,
        alice,
        { goal: "either", mode: "either", interest: "any" },
        now,
      ),
    /No plan fits/,
  );
});

test("connected in-person plans enforce both radii and require location", () => {
  const data = fixture();
  data.availability = [alice, bob].map((userId) => ({
    id: crypto.randomUUID(),
    userId,
    start,
    end,
    mode: "in_person",
    interests: ["Coffee"],
  }));
  const request = {
    goal: "either" as const,
    mode: "either" as const,
    interest: "any",
    requireLocation: true,
  };
  assert.throws(() => plan(data, alice, request, now), /No plan fits/);
  data.people = data.people.map((p) => ({
    ...p,
    profile: {
      ...p.profile,
      location: { latitude: 33.783, longitude: -84.383 },
    },
  }));
  assert.equal(plan(data, alice, request, now).activityId, "coffee");
  data.people[1].profile.location = { latitude: 34.0, longitude: -84.383 };
  assert.throws(() => plan(data, alice, request, now), /No plan fits/);
  assert.equal(
    distanceKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0 }),
    0,
  );
});

test("automatic-slot migration, durable queue, and atomic assignment", async (t) => {
  const pg = new PGlite({ extensions: { vector, btree_gist } });
  try {
    await pg.exec(`create schema auth;create schema extensions;
      create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth,public,extensions to authenticated,service_role;`);
    for (const file of [
      "202609240001_initial.sql",
      "202609240002_automatic_slots.sql",
    ])
      await pg.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
    for (const id of [alice, bob]) {
      await pg.query("insert into auth.users values ($1)", [id]);
      await pg.query("select save_convene_profile($1,$2,'','[]',null)", [
        id,
        JSON.stringify(profile),
      ]);
    }
    const a = crypto.randomUUID(),
      b = crypto.randomUUID();
    await pg.query(
      "insert into availability_blocks(id,user_id,start_time,end_time,mode,interests) values ($1,$2,$3,$4,'either',array['Coffee'])",
      [a, alice, start, end],
    );
    await t.test("transactional enqueue rolls back with its slot", async () => {
      const id = crypto.randomUUID();
      await pg.exec("begin");
      await pg.query(
        "insert into availability_blocks(id,user_id,start_time,end_time,mode) values($1,$2,$3,$4,'either')",
        [id, bob, start, end],
      );
      await pg.exec("rollback");
      assert.equal(
        (await pg.query("select * from matching_jobs where slot_id=$1", [id]))
          .rows.length,
        0,
      );
    });
    await t.test(
      "unmatched slots stay queued and later arrivals are indexed candidates",
      async () => {
        assert.equal(
          (await pg.query("select * from matching_candidates($1,1,null)", [a]))
            .rows.length,
          0,
        );
        await pg.query(
          "insert into availability_blocks(id,user_id,start_time,end_time,mode) values($1,$2,$3,$4,'either')",
          [b, bob, start, end],
        );
        assert.equal(
          (await pg.query("select * from matching_candidates($1,1,null)", [a]))
            .rows.length,
          1,
        );
        const adjacent = crypto.randomUUID();
        await pg.query(
          "insert into availability_blocks(id,user_id,start_time,end_time,mode) values($1,$2,$3,$4,'either')",
          [
            adjacent,
            bob,
            end,
            new Date(Date.parse(end) + 3600000).toISOString(),
          ],
        );
        assert.equal(
          (await pg.query("select * from matching_candidates($1,1,null)", [a]))
            .rows.length,
          1,
        );
        const indexes = await pg.query<{ indexdef: string }>(
          "select indexdef from pg_indexes where indexname='availability_pending_overlap'",
        );
        assert.match(indexes.rows[0].indexdef, /USING gist/);
      },
    );
    await t.test(
      "claims are exclusive, expired leases recover, and stale tokens cannot finish jobs",
      async () => {
        const first = (
          await pg.query<any>("select * from claim_matching_job()")
        ).rows[0];
        const second = (
          await pg.query<any>("select * from claim_matching_job()")
        ).rows[0];
        assert.notEqual(first.slot_id, second.slot_id);
        await pg.query(
          "update matching_jobs set lease_until=now()-interval '1 minute' where slot_id=$1",
          [first.slot_id],
        );
        await pg.query("select finish_matching_job($1,$2,$3,null,false)", [
          second.slot_id,
          second.revision,
          second.token,
        ]);
        const reclaimed = (
          await pg.query<any>("select * from claim_matching_job()")
        ).rows[0];
        assert.equal(reclaimed.slot_id, first.slot_id);
        assert.notEqual(reclaimed.token, first.token);
        await pg.query("select finish_matching_job($1,$2,$3,null,false)", [
          first.slot_id,
          first.revision,
          first.token,
        ]);
        assert.equal(
          (
            await pg.query<any>(
              "select state from matching_jobs where slot_id=$1",
              [first.slot_id],
            )
          ).rows[0].state,
          "processing",
        );
      },
    );
    const h = {
      id: crypto.randomUUID(),
      participantIds: [alice, bob],
      start,
      end: new Date(Date.parse(start) + 3600000).toISOString(),
      activityId: "coffee",
      reason: "Shared interests",
      score: 80,
      seededVenue: true,
    };
    const profiles = JSON.stringify({ [alice]: profile, [bob]: profile });
    const schedule = (slots: unknown) =>
      pg.query("select schedule_convene_slots($1,$2,$3,$4)", [
        alice,
        JSON.stringify(h),
        JSON.stringify(slots),
        profiles,
      ]);
    await t.test(
      "editing invalidates old revisions; forged ownership and stale proposals fail",
      async () => {
        await assert.rejects(
          pg.query("select update_convene_slot($1,$2,'paused',null)", [bob, a]),
          /schedule_conflict/,
        );
        await pg.query("select update_convene_slot($1,$2,'paused',null)", [
          alice,
          a,
        ]);
        await pg.query("select update_convene_slot($1,$2,'pending',null)", [
          alice,
          a,
        ]);
        await assert.rejects(
          schedule([
            { id: a, revision: 1 },
            { id: b, revision: 1 },
          ]),
          /schedule_conflict/,
        );
        assert.equal((await pg.query("select * from hangouts")).rows.length, 0);
      },
    );
    await t.test(
      "both slots fill atomically and cannot be reused even at a different time",
      async () => {
        await pg.exec("set role service_role");
        await schedule([
          { id: a, revision: 3 },
          { id: b, revision: 1 },
        ]);
        await pg.exec("reset role");
        assert.equal(
          (
            await pg.query(
              "select * from availability_blocks where status='filled'",
            )
          ).rows.length,
          2,
        );
        await assert.rejects(
          schedule([
            { id: a, revision: 3 },
            { id: b, revision: 1 },
          ]),
          /schedule_conflict/,
        );
        assert.equal((await pg.query("select * from hangouts")).rows.length, 1);
      },
    );
    await t.test(
      "cancellation does not requeue slots until explicit reopening",
      async () => {
        await pg.query("update hangouts set status='cancelled' where id=$1", [
          h.id,
        ]);
        assert.equal(
          (
            await pg.query(
              "select * from availability_blocks where status='cancelled'",
            )
          ).rows.length,
          2,
        );
        assert.equal(
          (await pg.query("select * from booking_reservations")).rows.length,
          0,
        );
        await pg.query("select update_convene_slot($1,$2,'pending',null)", [
          alice,
          a,
        ]);
        assert.equal(
          (
            await pg.query<any>(
              "select status from availability_blocks where id=$1",
              [a],
            )
          ).rows[0].status,
          "pending",
        );
      },
    );
    await t.test(
      "representative overlap search uses the partial GiST index",
      async () => {
        await pg.exec("begin");
        try {
          const seed = "20000000-0000-4000-8000-000000000001";
          await pg.query(
            "insert into users(id,profile,seeded) values($1,$2,true)",
            [seed, JSON.stringify(profile)],
          );
          await pg.query(
            `insert into availability_blocks(user_id,start_time,end_time,mode)
          select $1,now()+i*interval '1 hour',now()+(i+1)*interval '1 hour','either' from generate_series(1,6000) i`,
            [seed],
          );
          await pg.exec("analyze availability_blocks");
          const result = await pg.query(
            `explain (analyze,buffers,format json) select id from availability_blocks
          where status='pending' and during && tstzrange($1::timestamptz,$2::timestamptz,'[)') and end_time>now() order by id limit 100`,
            [start, end],
          );
          assert.match(
            JSON.stringify(result.rows),
            /availability_pending_overlap/,
          );
        } finally {
          await pg.exec("rollback");
        }
      },
    );
    await t.test(
      "queue and scheduling RPCs are inaccessible to browser roles",
      async () => {
        await pg.exec("set role authenticated");
        await assert.rejects(
          pg.query("select * from matching_jobs"),
          /permission denied/,
        );
        await assert.rejects(
          pg.query("select * from claim_matching_job()"),
          /permission denied/,
        );
        await assert.rejects(
          schedule([
            { id: a, revision: 6 },
            { id: b, revision: 3 },
          ]),
          /permission denied/,
        );
        await pg.exec("reset role");
      },
    );
    await t.test(
      "overlap migration preserves existing conflicts and guards create, edit, and reopen",
      async () => {
        const migration = await readFile(
          "supabase/migrations/202609240003_availability_no_overlap.sql",
          "utf8",
        );
        const duplicate = crypto.randomUUID();
        await pg.query(
          "insert into availability_blocks(id,user_id,start_time,end_time,mode,status) values($1,$2,$3,$4,'online','paused')",
          [duplicate, alice, start, end],
        );
        await assert.rejects(
          pg.exec(migration),
          /resolve existing overlapping/,
        );
        await pg.exec("rollback");
        assert.equal(
          (
            await pg.query("select id from availability_blocks where id=$1", [
              duplicate,
            ])
          ).rows.length,
          1,
        );
        await pg.query("delete from availability_blocks where id=$1", [
          duplicate,
        ]);
        await pg.exec(migration);
        await assert.rejects(
          pg.query(
            "insert into availability_blocks(user_id,start_time,end_time,mode) values($1,$2,$3,'online')",
            [alice, start, end],
          ),
          /availability_no_overlap/,
        );
        const adjacent = crypto.randomUUID();
        const later = new Date(Date.parse(end) + 3600000).toISOString();
        await pg.query(
          "insert into availability_blocks(id,user_id,start_time,end_time,mode,status) values($1,$2,$3,$4,'online','paused')",
          [adjacent, alice, end, later],
        );
        await assert.rejects(
          pg.query("select update_convene_slot($1,$2,'paused',$3)", [
            alice,
            adjacent,
            JSON.stringify({
              start,
              end,
              mode: "either",
              interests: [],
              goals: [],
            }),
          ]),
          /availability_no_overlap/,
        );
        assert.equal(
          (
            await pg.query<{ unchanged: boolean }>(
              "select start_time=$2::timestamptz as unchanged from availability_blocks where id=$1",
              [adjacent, end],
            )
          ).rows[0].unchanged,
          true,
        );
        await pg.query(
          "insert into availability_blocks(id,user_id,start_time,end_time,mode,status) values($1,$2,$3,$4,'either','cancelled')",
          [duplicate, alice, start, end],
        );
        await assert.rejects(
          pg.query("select update_convene_slot($1,$2,'pending',null)", [
            alice,
            duplicate,
          ]),
          /availability_no_overlap/,
        );
        // Another user can still offer exactly the same window.
        await pg.query("select update_convene_slot($1,$2,'pending',null)", [
          bob,
          b,
        ]);
      },
    );
  } finally {
    await pg.close();
  }
});
