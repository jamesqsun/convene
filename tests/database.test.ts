import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { defaultProfile } from "../src/lib/catalog";

test("Postgres migration, privacy policies, and transaction behavior", async (t) => {
  const pg = new PGlite({ extensions: { vector, btree_gist } });
  const alice = "10000000-0000-4000-8000-000000000001";
  const bob = "10000000-0000-4000-8000-000000000002";
  const outsider = "10000000-0000-4000-8000-000000000003";
  try {
    // Minimal Supabase auth scaffolding; the actual migration is used unchanged.
    await pg.exec(`create schema auth; create schema extensions;
      create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
      grant usage on schema auth, public, extensions to authenticated, service_role;
      grant all on auth.users to service_role;`);
    await pg.exec(
      await readFile("supabase/migrations/202609240001_initial.sql", "utf8"),
    );
    for (const id of [alice, bob, outsider]) {
      await pg.query("insert into auth.users(id) values ($1)", [id]);
      await pg.query("select save_convene_profile($1,$2,$3,$4,$5)", [
        id,
        JSON.stringify({
          ...defaultProfile,
          name: id === alice ? "Alice" : "Bob",
        }),
        "Public interests",
        JSON.stringify([
          {
            id: crypto.randomUUID(),
            topic: "Private",
            summary: "Private note",
            evidence: "Private note",
            source: "onboarding",
            confidence: 1,
          },
        ]),
        null,
      ]);
    }
    const start = new Date(Date.now() + 86400000).toISOString();
    const end = new Date(Date.now() + 86400000 + 3600000).toISOString();
    for (const id of [alice, bob])
      await pg.query(
        "insert into availability_blocks(user_id,start_time,end_time,mode) values ($1,$2,$3,'either')",
        [id, start, end],
      );
    const h = {
      id: crypto.randomUUID(),
      participantIds: [alice, bob],
      start,
      end,
      activityId: "coffee",
      reason: "Shared interests",
      score: 85,
      seededVenue: true,
    };

    await t.test(
      "profile writes and scheduling execute with service-role privileges",
      async () => {
        await pg.exec("set role service_role");
        await pg.query("select schedule_convene_hangout($1,$2)", [
          alice,
          JSON.stringify(h),
        ]);
        await pg.exec("reset role");
        assert.equal(
          (await pg.query("select * from booking_reservations")).rows.length,
          2,
        );
      },
    );
    await t.test(
      "conflicting plans fail without partial hangouts or participants",
      async () => {
        await assert.rejects(
          pg.query("select schedule_convene_hangout($1,$2)", [
            alice,
            JSON.stringify({ ...h, id: crypto.randomUUID() }),
          ]),
          /schedule_conflict/,
        );
        assert.equal((await pg.query("select * from hangouts")).rows.length, 1);
        assert.equal(
          (await pg.query("select * from hangout_participants")).rows.length,
          2,
        );
      },
    );
    await t.test(
      "RLS exposes only own memories, profile, and participating hangouts",
      async () => {
        await pg.exec("set role authenticated");
        await pg.query("select set_config('request.jwt.claim.sub',$1,false)", [
          alice,
        ]);
        assert.equal((await pg.query("select * from users")).rows.length, 1);
        assert.equal(
          (await pg.query("select * from preference_memories")).rows.length,
          1,
        );
        assert.equal((await pg.query("select * from hangouts")).rows.length, 1);
        await pg.query("select set_config('request.jwt.claim.sub',$1,false)", [
          outsider,
        ]);
        assert.equal((await pg.query("select * from hangouts")).rows.length, 0);
        await assert.rejects(
          pg.query("select schedule_convene_hangout($1,$2)", [
            outsider,
            JSON.stringify(h),
          ]),
          /permission denied/,
        );
        await assert.rejects(
          pg.query("update users set summary='overwrite'"),
          /permission denied/,
        );
        await pg.exec("reset role");
      },
    );
    await t.test(
      "the exclusion constraint also protects direct reservation writes",
      async () => {
        const other = crypto.randomUUID();
        await pg.query(
          "insert into hangouts(id,activity_id,start_time,end_time,reason,score) values ($1,'coffee',$2,$3,'test',80)",
          [other, start, end],
        );
        await assert.rejects(
          pg.query(
            "insert into booking_reservations(hangout_id,user_id,during) values ($1,$2,tstzrange($3,$4,'[)'))",
            [other, alice, start, end],
          ),
          /exclusion constraint/,
        );
        await pg.query("delete from hangouts where id=$1", [other]);
      },
    );
    await t.test("cancellation releases all reservation ranges", async () => {
      await pg.query("update hangouts set status='cancelled' where id=$1", [
        h.id,
      ]);
      assert.equal(
        (await pg.query("select * from booking_reservations")).rows.length,
        0,
      );
      h.id = crypto.randomUUID();
      await pg.query("select schedule_convene_hangout($1,$2)", [
        alice,
        JSON.stringify(h),
      ]);
    });
    await t.test(
      "feedback is participant-only, after the event, and applied once",
      async () => {
        const f = {
          id: crypto.randomUUID(),
          hangoutId: h.id,
          rating: 4,
          meetAgain: false,
          comments: "Prefer someone else",
        };
        await assert.rejects(
          pg.query("select submit_convene_feedback($1,$2,null)", [
            alice,
            JSON.stringify(f),
          ]),
          /feedback_not_allowed/,
        );
        await pg.query(
          "update hangouts set start_time=now()-interval '2 hours', end_time=now()-interval '1 hour' where id=$1",
          [h.id],
        );
        await assert.rejects(
          pg.query("select submit_convene_feedback($1,$2,null)", [
            outsider,
            JSON.stringify(f),
          ]),
          /feedback_not_allowed/,
        );
        const memory = {
          id: crypto.randomUUID(),
          topic: "Feedback",
          summary: f.comments,
          evidence: f.comments,
          source: "feedback",
          confidence: 0.9,
        };
        await pg.query("select submit_convene_feedback($1,$2,$3)", [
          alice,
          JSON.stringify(f),
          JSON.stringify(memory),
        ]);
        await assert.rejects(
          pg.query("select submit_convene_feedback($1,$2,null)", [
            alice,
            JSON.stringify(f),
          ]),
          /duplicate_feedback/,
        );
        const rows = (
          await pg.query<{ status: string; hangout_count: number }>(
            "select * from connections where user_id=$1",
            [alice],
          )
        ).rows;
        assert.equal(rows[0].status, "declined");
        assert.equal(rows[0].hangout_count, 1);
        await pg.exec("set role authenticated");
        await pg.query("select set_config('request.jwt.claim.sub',$1,false)", [
          bob,
        ]);
        assert.equal((await pg.query("select * from feedback")).rows.length, 0);
        await pg.exec("reset role");
      },
    );
    await t.test(
      "blocking cancels future bookings atomically and prevents new ones",
      async () => {
        await pg.query("delete from connections where user_id=$1", [alice]);
        await pg.query("update hangouts set status='cancelled' where id=$1", [
          h.id,
        ]);
        h.id = crypto.randomUUID();
        await pg.query("select schedule_convene_hangout($1,$2)", [
          alice,
          JSON.stringify(h),
        ]);
        await pg.exec("set role service_role");
        await pg.query("select manage_convene_connection($1,$2,'blocked')", [
          alice,
          bob,
        ]);
        await pg.exec("reset role");
        assert.equal(
          (await pg.query("select * from booking_reservations")).rows.length,
          0,
        );
        await assert.rejects(
          pg.query("select schedule_convene_hangout($1,$2)", [
            alice,
            JSON.stringify({ ...h, id: crypto.randomUUID() }),
          ]),
          /schedule_conflict/,
        );
      },
    );
  } finally {
    await pg.close();
  }
});
