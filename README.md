# Convene

**You give Convene time. Convene turns it into plans.**

A mobile-first social planning PWA. People complete a short onboarding, save when they are free, and
a nightly city-local batch assigns them to small in-person hangouts at least 48 hours ahead. Convene
picks the company, the activity, the venue, and the exact time. Afterwards everyone answers, per
person, "Would you want to meet this person again?"; a mutual yes creates a friendship, and
friendships that are overdue for a reunion get priority in later batches.

Built with Next.js 16 (App Router), React 19, TypeScript, Tailwind, Postgres (Supabase in production,
in-process PGlite for demo and tests), pgvector, OpenAI structured outputs, Google Places, and web push.

The product and algorithm are specified in [overview.md](overview.md),
[technical-requirements.md](technical-requirements.md), and [technical-design.md](technical-design.md).
[IMPLEMENTATION.md](IMPLEMENTATION.md) tracks status and [DECISIONS.md](DECISIONS.md) records every
judgment call made where the specs left room.

## Quick start (demo mode, no credentials)

Requirements: Node.js 20.9 or newer and pnpm 12 (`npm install -g pnpm`).

```sh
pnpm install
pnpm dev
```

Open [localhost:3000](http://localhost:3000). Demo mode boots an in-process Postgres, applies the
real migrations, and seeds twelve fictional people (nine in Toronto, three in Vancouver) with
memories, availability for the next two planning dates, and two completed past hangouts so
friendships exist with real provenance. Everything lives in server memory and resets on restart.
No external service is ever contacted in demo mode, even if keys are present in `.env.local`.

### Try the whole loop

1. On the sign-in page, tap a persona chip (start with **Maya**). Or create an account and walk
   through onboarding: name and age, city, phone, interests, three written answers, then the
   memory sketch is generated.
2. **Availability** shows the seeded windows waiting for their batch, with the time the batch runs.
   Add a window of your own; it is saved in your city's time zone and must end more than 49 hours
   from now. Tap **Run planning now (demo)** to execute the batch immediately instead of waiting for
   midnight.
3. A banner announces the new plan. **Plans** shows the activity, the fictional venue (labelled as
   such, with unverified hours), the exact time, the other people with their interests, and their
   phone numbers. **Withdraw** removes only you; the plan survives if two people remain.
4. **Hangouts** lists completed hangouts. Answer yes or no for each person. Answers are private and
   final; when both people say yes they become friends, shown as a badge.
5. **Graph** draws you in the middle and everyone you have met around you. Friends are solid lines;
   lines fade with time since your last Convene hangout together but never disappear.
6. **Profile** shows what Convene remembers as editable memories. Edit a title, summary, or
   individual attribute, or delete a memory; derived embeddings refresh immediately. The answers page
   lets you change your raw answers and regenerate.
7. The push banner asks for notification permission. In demo mode a throwaway VAPID key lets the
   browser subscribe and the server logs what it would have sent.

Run the automated end-to-end smoke test against a running demo server (it refuses to touch a
connected server):

```sh
pnpm smoke                      # HTTP API flow, against http://localhost:3000
pnpm e2e                        # real browser flow in the locally installed Chrome
CONVENE_SMOKE_URL=http://localhost:3005 pnpm smoke
```

## How planning works

1. Saving availability only authorizes a future batch; nothing is planned immediately.
2. At each city's local midnight the batch targets the local date two days ahead (Monday plans
   Wednesday). Catch-up passes run hourly for that date to pick up late availability, for as long
   as a one-hour window could still start 48 hours out.
3. Slots are clipped to the local day and to the 48-hour cutoff. At every distinct start, people
   whose window contains the next 60 minutes form a candidate bucket; buckets keep their full common
   window.
4. Buckets are chosen greedily by people count plus a capped reconnection bonus, removing chosen
   people and recomputing until nothing with two people remains. The bonus per overdue friend pair
   ramps from zero at 14 days to one at 60 days since their last completed hangout, requires mutual
   yes feedback on that latest hangout, and is capped at half the bucket size.
5. Each bucket is split into groups of two to five (target four, no singletons) by profile
   embedding similarity plus the same reconnection bonus.
6. The model ranks the activity catalog from public interests and each member's own memory
   summaries; ids and durations are validated and a deterministic fallback always exists. A venue is
   found within the city and an exact start is chosen on a 15-minute grid, respecting opening hours
   when known.
7. One transaction revalidates every slot revision, the local date, the 48-hour rule, and the group
   size, then writes the event, participants, reservations, and per-date assignments, fills the
   slots, and queues push jobs. A stable planning id makes retries idempotent.
8. Push jobs are sent after commit with per-device tracking, retirement of dead subscriptions, and
   bounded backoff. In-app status never depends on push.

Events complete automatically at their end time (derived, no worker needed). Withdrawal is only
possible before the start; attendance is assumed afterwards.

## Connect Supabase, OpenAI, Google Places, and push

1. Create a Supabase project. Enable the email/password provider and set the Site URL.
2. Copy `.env.example` to `.env.local`, set `CONVENE_MODE=supabase`, and fill in `DATABASE_URL`
   (the transaction pooler URL on Vercel), the Supabase URL and keys, and `CRON_SECRET`.
   `OPENAI_API_KEY`, `GOOGLE_PLACES_API_KEY`, and the VAPID keys are optional: without them the app
   uses interest-only planning, the fictional venue provider, and a logging push sender.
   Generate VAPID keys with `node -e "console.log(require('web-push').generateVAPIDKeys())"`.
3. Apply the schema and seed the fictional pool (personas become real accounts with `SEED_PASSWORD`):

   ```sh
   pnpm migrate
   pnpm seed
   ```

4. Run the app and, in a second terminal, the scheduler:

   ```sh
   pnpm dev
   pnpm worker            # posts to /api/jobs/run every 60 seconds; --once for a single tick
   ```

   In production, point any cron at `/api/jobs/run` (GET or POST) with
   `Authorization: Bearer <CRON_SECRET>` at least every ten minutes. Each call expires dead slots,
   runs every due city batch (main and catch-up), and drains push jobs. `vercel.json` schedules
   Vercel Cron every ten minutes and Vercel adds the bearer header automatically when `CRON_SECRET`
   is set; note that Hobby projects only allow daily crons, so use a Pro project or an external
   cron service for hourly catch-up passes. The route declares a 300-second budget.

Row level security is enabled on every table with no policies for the browser roles, so PostgREST
exposes nothing; all access goes through the authenticated server routes.

### Reset connected data to the seed

`pnpm seed` updates the fictional personas but preserves other users and existing history.
For a clean start, stop the app, worker, and hosted cron, then run:

```sh
pnpm db:reset --yes
```

This requires `CONVENE_MODE=supabase` and the same environment as `pnpm seed`. It applies pending
migrations, permanently deletes **every Supabase Auth user** (including real accounts), and replaces
all Convene table data with 12 fictional accounts, 22 future availability slots, two past hangouts,
and their seeded feedback/friendships. Accounts use `SEED_PASSWORD`. Without `--yes`, it refuses
before connecting. Use a dedicated development Supabase project.

Dates are relative to the reset time; generated row IDs and timestamps are fresh. Reset always uses
the deterministic demo embeddings, even if an OpenAI key is configured, and makes no AI, Places,
or push calls. Project settings, Storage, unrelated tables, and existing schema are preserved;
this is a data reset, not a repair of manually changed schema. Users owning Storage objects must
have those objects removed or reassigned before Auth deletion can succeed.

Auth API changes cannot be rolled back together with SQL. If interrupted, fix the reported error
and rerun the command; it clears partial seed state on retry. Keep writers stopped until it succeeds,
then restart the app/scheduler and sign in again.

## Checks

```sh
pnpm typecheck
pnpm test          # 346 tests: pure planning logic, real migrations in PGlite, routes, components
pnpm build
pnpm format
```

Database tests run the actual migrations in an in-process Postgres with pgvector and btree_gist and
exercise the commit, withdrawal, and feedback transactions directly. No credentials are needed.

## Project structure

```text
src/app/                   Next.js pages and one-line route re-exports
src/lib/                   env, database drivers (pg and PGlite), migrations, http helpers, time zones
src/features/auth/         Supabase and demo sessions, sign-in and sign-up
src/features/profile/      onboarding, interests vocabulary, profile store
src/features/memories/     generation with evidence validation, edit/delete, derived embeddings
src/features/availability/ slot lifecycle and derived states
src/features/planning/     the pure pipeline: segments, buckets, selection, grouping, activities, venues, batch driver
src/features/events/       plan reads and withdrawal
src/features/feedback/     per-person feedback and friendships
src/features/graph/        the personal connection graph
src/features/push/         subscriptions, sender, service-worker client
src/features/seed/         the fictional world
supabase/migrations/       schema, deny-all RLS, the three transaction functions, and their tests
scripts/                   migrate, seed, worker, smoke, icon generation
```

## Boundaries

- Availability is dated, not recurring. City membership is an approximation of reachability.
- Venue facts come from the provider as-is; missing hours are labelled unverified and nothing is
  reserved. Demo venues are fictional and say so.
- Phone ownership is not verified. Push targets device subscriptions, not phone numbers, and the
  48-hour guarantee covers assignment, not notification delivery.
- Explanations use public interests only. Private memories, raw answers, and feedback answers are
  visible only to their owner.
- Hosted verification (Supabase auth emails, a real OpenAI key, a real Places key, push on a phone
  over HTTPS) requires your credentials and is tracked in IMPLEMENTATION.md.
