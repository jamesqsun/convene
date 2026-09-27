# Convene

**You give Convene time. Convene turns it into plans.**

A mobile-first social planning PWA. People complete a short onboarding, save when they are free, and
a nightly city-local batch assigns them to small in-person hangouts at least 48 hours ahead. Convene
picks the company, the activity, the venue, and the exact time. Afterwards everyone answers, per
person, "Would you want to meet this person again?"; a mutual yes creates a friendship, and
friendships that are overdue for a reunion get priority in later batches.

Built with Next.js 16 (App Router), React 19, TypeScript, Tailwind, Postgres (Supabase in production,
in-process PGlite for demo and tests), pgvector, Meta Muse Spark structured outputs, Gemini/OpenAI embeddings,
Google Places, and web push.

The product and algorithm are specified in [overview.md](overview.md),
[technical-requirements.md](technical-requirements.md), and [technical-design.md](technical-design.md).
[IMPLEMENTATION.md](IMPLEMENTATION.md) tracks status and [DECISIONS.md](DECISIONS.md) records every
judgment call made where the specs left room.

## Quick start (demo mode, no credentials)

Requirements: Node.js 20.9 or newer and pnpm 10.34.5 (`npm install -g pnpm@10.34.5`).

```sh
pnpm install
pnpm dev
```

Open [localhost:3000](http://localhost:3000). Demo mode boots an in-process Postgres, applies the
real migrations, and seeds twelve fictional people (nine in Toronto, three in Vancouver) with
memories, availability for the next two planning dates, and two completed past hangouts so
friendships exist with real provenance. Everything lives in server memory and resets on restart.
No external service is ever contacted in demo mode, even if keys are present in `.env.local`.

### Google Calendar and your week

Availability is set per week on a Monday-to-Sunday grid in your city's time zone: paint the
half-hours you are free and save. Weeks you never set are copied automatically from your most
recent week when planning runs (turn this off with the checkbox on the Availability page). With a
Google account connected, busy events from the calendars you tick are subtracted from your windows
before planning, checked again live right before a booking, and every assigned hangout is written
to a dedicated "Convene" calendar in your account and removed if you withdraw. Demo mode connects
Maya and Ben to a fictional calendar so the overlay is visible without Google.

### Try the whole loop

1. On the sign-in page, tap a persona chip (start with **Maya**). Or create an account and walk
   through onboarding: name and age, city, phone, interests, three written answers, then the
   memory sketch is generated.
2. **Availability** shows the week grid with Maya's seeded windows, the fictional calendar's busy
   time in amber, and cells too soon to plan greyed out. Drag across cells to paint or clear, save
   the week, or step to next week. Tap **Run planning now (demo)** to execute the batch immediately
   instead of waiting for midnight.
3. A banner announces the new plan. **Plans** shows a card per plan; tap one for a popup with the
   activity, the fictional venue (labelled as such, with unverified hours), the exact time, the
   other people with their interests, and their phone numbers. **Withdraw** removes only you; the
   plan survives if two people remain. Completed hangouts sit in a "Past hangouts" section at the
   bottom of the same page rather than their own tab; answer yes or no for each person there.
   Answers are private and final; when both people say yes they become friends, shown as a badge.
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
9. Each tick also carries availability forward for people who have not set the week the planner
   targets, refreshes connected calendars that are more than thirty minutes stale, and mirrors new
   and cancelled hangouts into people's Convene calendars.

To manually plan all future availability without waiting for scheduled batches, deploy the latest
server code, set `CONVENE_WORKER_URL` to your Vercel URL and `CRON_SECRET` to the same secret as
Vercel in `.env.local`, then run `pnpm planning:run-all`. This sends an authenticated POST to
`/api/jobs/run` with `{ "allBatches": true }`. All processing uses the server's providers and database.
It runs one pass per existing plannable batch or city/date with pending availability, including
future dates and immediate catch-up. It retains the 48-hour cutoff, live leases, calendar checks,
and assignment constraints; existing hangouts are preserved. Manual runs can retry exhausted
batches, but retain per-person failed-group limits. It also runs normal maintenance, calendar
sync, and notifications. It does not generate unlimited future recurring weeks. Large sweeps
remain subject to Vercel's request duration limit. The command prints the full summary and exits
nonzero for HTTP errors or reported batch/group failures.

To force all unfinished scheduled events into past hangouts, run `pnpm events:complete-all`
after deploying the latest server code. It uses `CONVENE_WORKER_URL` and `CRON_SECRET` from
`.env.local` to call the running server. This changes their start/end timestamps to end now,
preserving duration, and unlocks feedback. It releases future reservations and settles queued
notifications; filled slots and original planning-date assignments remain. Cancelled and
already-completed events are unchanged. Existing Google Calendar entries are not updated.
The script prints the number completed and exits; repeating it does not alter completed events.

To diagnose missing phone notifications, open Profile in the installed app and tap **Send test
notification**. It registers that device and sends through the deployed server; simulated senders
are rejected. "Accepted" means the push service accepted delivery, not that the phone displayed it.
Check Notification Center, Focus, and notification settings if accepted tests remain invisible.
`pnpm exec tsx scripts/diagnose-push.ts` reads subscription and delivery status from the configured
database without sending or changing anything; endpoint tokens and encryption keys are omitted.

Past hangouts also offer private overall event feedback, separate from each person's meet-again
answer. Submitting saves the text immediately (HTTP 202); Next.js `after` starts extraction and
embedding after the response. You can leave the page; the app's regular state refresh shows when
memories are ready. These memories help future grouping and activity ranking and can be edited
or deleted from the profile. The existing worker retries pending updates, including interrupted
requests, with a ten-minute lease and exponential backoff; after five attempts a manual retry is
offered. Each worker tick handles up to two updates concurrently. Keep the worker running for
retry recovery. Repeated submissions do not duplicate memories. Onboarding regeneration preserves
feedback memories. Apply migrations `0013_event_feedback.sql` and `0014_feedback_memory_jobs.sql`
with `pnpm migrate` before deploying with `npx vercel@latest --prod`.

Planning builds and selects buckets first, then ranks activities and finds venues for up to four
finalized groups concurrently. City/date batches retain their original sequential order.

The worker sends a "How was your hangout?" push on its first check after completion, for events
ended within the last 24 hours. It skips withdrawn participants, cancelled events, and people who
already submitted event feedback. Tapping this reminder or an older plan notification opens that
hangout's feedback controls. Apply `0015_feedback_reminders.sql` with `pnpm migrate` before deploying.

Events complete automatically at their end time (derived, no worker needed). Withdrawal is only
possible before the start; attendance is assumed afterwards.

## Google Cloud setup for calendar sync

1. Create a project at https://console.cloud.google.com and enable the **Google Calendar API**.
2. Under **OAuth consent screen**, choose External, add the scopes
   `https://www.googleapis.com/auth/calendar`, `openid`, and `email`, and add every tester as a test
   user while the app is in Testing status (Google shows an "unverified app" screen they click through).
3. Under **Credentials**, create an OAuth client of type Web application with the redirect URI
   `http://localhost:3000/api/calendar/google/callback` (plus your deployed origin and the same path).
4. Put the client id and secret in `.env.local` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`,
   and set `CALENDAR_TOKEN_SECRET` to a random string of at least 32 characters (it encrypts stored
   refresh tokens). Without these three, connected mode hides the calendar card.

## Connect Supabase, Meta Muse Spark, Gemini, Google Places, and push

1. Create a Supabase project. Enable the email/password provider and set the Site URL.
   For "Continue with Google", enable the Google provider under Authentication > Providers with
   the OAuth client id and secret, add `http://localhost:3000/api/auth/google/callback` (plus your
   deployed origin and the same path) under Authentication > URL Configuration > Redirect URLs, and
   add `https://YOUR_PROJECT.supabase.co/auth/v1/callback` to the Google OAuth client's authorized
   redirect URIs. Without this the link returns to the sign-in page with a notice.
2. Copy `.env.example` to `.env.local`, set `CONVENE_MODE=supabase`, and fill in `DATABASE_URL`
   (the transaction pooler URL on Vercel), the Supabase URL and keys, and `CRON_SECRET`.
   Set `META_API_KEY` and the selected embedding provider's key together for AI, or leave both blank
   for the demo AI fallback. `EMBEDDING_PROVIDER` defaults to `gemini`; set it to `openai` to use OpenAI embeddings.
   `GOOGLE_PLACES_API_KEY`, the Google Calendar keys, and the VAPID keys are optional: without them the app
   uses the fictional venue provider and a logging push sender.
   Generate VAPID keys with `node -e "console.log(require('web-push').generateVAPIDKeys())"`.
3. Apply the schema and seed the fictional pool (personas become real accounts with `SEED_PASSWORD`):

   ```sh
   pnpm migrate
   pnpm seed
   ```

   For a fuller pool, `pnpm seed --people 200` also adds that many generated people (up to 1000)
   in Toronto and Vancouver, each with answers, memories, and availability, plus one past hangout
   per three people with feedback and friendships. They are fictional (`@convene.demo`, 555
   numbers), sign in with `SEED_PASSWORD`, and are planned like anyone else, so the next batch
   makes a model and venue request for each group it forms. Their ids are fixed: running it again
   updates the same people. On Node 20, prefix `pnpm seed` and `pnpm db:reset` with
   `NODE_OPTIONS=--experimental-websocket`.

4. Run the app and, in a second terminal, the scheduler:

   ```sh
   pnpm dev
   pnpm worker            # posts to /api/jobs/run every 60 seconds; --once for a single tick
   ```

   In production, point any cron at `/api/jobs/run` (GET or POST) with
   `Authorization: Bearer <CRON_SECRET>` at least every ten minutes. Each call expires dead slots,
   runs every due city batch (main and catch-up), and drains push jobs. The default `vercel.json`
   does not register a Vercel Cron, so it can deploy on Hobby. Configure an external scheduler or
   keep the worker running against the production URL; without one, automatic planning and queued
   notifications do not run. The route declares a 300-second budget.

### Deploy to Vercel Hobby

Add the production variables from `.env.example` in Vercel's project environment settings,
including `CONVENE_MODE=supabase`. Then run from this directory:

```sh
npx vercel@latest --prod
```

The project pins pnpm 10.34.5 and a single-document lockfile for Vercel compatibility. Do not
regenerate it with pnpm 11/12: their multi-document lockfiles can fail Vercel's config parser.
The install and build commands in `vercel.json` use the pinned version explicitly.

Hobby permits only daily Vercel Cron jobs, which is insufficient for Convene's city-local planning
and catch-up passes. For a local development/demo deployment, keep this worker running in PowerShell
(with `CRON_SECRET` in `.env.local` matching the production secret):

```powershell
$env:CONVENE_WORKER_URL = 'https://YOUR-PROJECT.vercel.app'
npx --yes pnpm@10.34.5 worker --interval-seconds 600
```

For unattended use, configure an external scheduler to send GET or POST to
`https://YOUR-PROJECT.vercel.app/api/jobs/run` every ten minutes with the header
`Authorization: Bearer <CRON_SECRET>`. The local worker only runs while its terminal and computer
remain running. If using Vercel Pro instead, add
`"crons": [{ "path": "/api/jobs/run", "schedule": "*/10 * * * *" }]` to `vercel.json`;
Vercel attaches the secret header automatically.

GitHub integration is separate from CLI deployment. If repository connection fails, grant the
Vercel GitHub App access to the repository, then connect it in Project Settings > Git. A repository
owner may need to grant that access. You can deploy local source with the CLI while Git integration
is unconnected; automatic deployments on push require the integration to work.

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
the deterministic demo embeddings, even if AI keys are configured, and makes no AI, Places,
or push calls. Project settings, Storage, unrelated tables, and existing schema are preserved;
this is a data reset, not a repair of manually changed schema. Users owning Storage objects must
have those objects removed or reassigned before Auth deletion can succeed.

Auth API changes cannot be rolled back together with SQL. If interrupted, fix the reported error
and rerun the command; it clears partial seed state on retry. Keep writers stopped until it succeeds,
then restart the app/scheduler and sign in again.

### AI providers and migrating existing embeddings

Get `META_API_KEY` from [Meta Model API](https://dev.meta.ai/) and `GEMINI_API_KEY` from
[Google AI Studio](https://aistudio.google.com/api-keys). The Gemini key is separate from the
Google Places integration. Defaults are `META_MODEL=muse-spark-1.3` (Standard tier) and
`GEMINI_EMBEDDING_MODEL=gemini-embedding-2`. The latter also supports `gemini-embedding-001`.
Both embedding models return 1536-dimensional vectors, validated and normalized before storage.
Muse Spark generates preference memories and ranks activities. Choose the provider that embeds memory
text for matching with `EMBEDDING_PROVIDER=gemini` (default) or `EMBEDDING_PROVIDER=openai`.

For OpenAI embeddings, set `OPENAI_API_KEY` and optionally `OPENAI_EMBEDDING_MODEL` (defaults to
`text-embedding-3-small`; also supports `text-embedding-3-large`). A Gemini key is not required for
this option. Only the selected provider receives embedding requests; errors never switch providers.
Both providers use 1536 dimensions. `OPENAI_MODEL` is unused: text generation stays on Meta.

The `openai` npm package is a compatible client for Meta's Responses API at `https://api.meta.ai/v1`
and, when selected, OpenAI's embeddings endpoint. AI source code lives under `src/features/ai`.
Meta responses use `store: false`.

When upgrading an existing database, stop the app and scheduler and run:

```sh
pnpm migrate
pnpm embeddings:rebuild
```

Migration 0012 clears old vectors without deleting memories, users, plans, or history. Until rebuilt,
matching falls back to interests. The rebuild uses the selected embedding provider and makes billable API calls; it does not
regenerate memory text. It clears all vectors first, so a failed run cannot leave old and new model
vectors mixed. Fix the error and rerun to complete an interrupted rebuild.

Also rebuild after changing embedding providers or models, enabling real AI after using the fallback, or running
`db:reset` (which intentionally creates demo vectors). Keep the app and worker stopped during these
changes, then restart them after the rebuild. Meta's key and the selected embedding provider's key
must be configured for connected AI; configuring only one fails at startup instead of silently mixing
real and fake providers. Unselected provider keys are not used. No schema migration is required just
to switch providers; existing vectors must still be rebuilt because their meanings differ.

API references: [Meta structured output](https://dev.meta.ai/docs/structured-output),
[Gemini embeddings](https://ai.google.dev/gemini-api/docs/embeddings),
[OpenAI embeddings](https://developers.openai.com/api/docs/guides/embeddings).

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
- Hosted verification (Supabase auth emails, real Meta and selected embedding-provider keys, a real Places key, push on a phone
  over HTTPS) requires your credentials and is tracked in IMPLEMENTATION.md.
