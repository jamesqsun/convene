# Convene

> **Planning rework agreed, implementation pending:** [Technical design](technical-design.md), [technical requirements](technical-requirements.md), and [product overview](overview.md) now specify daily city-based batches, at least 48 hours' notice, one-hour overlap buckets, and in-person groups with phone coordination. The target removes activity, budget, group-size, platform/tool, mode, travel-radius, and connection-category controls, plus online and blocking workflows. The instructions below describe the current runnable implementation, which still includes those older features. Track the transition in [IMPLEMENTATION.md](IMPLEMENTATION.md).

**You give Convene time. Convene turns it into plans.**

A mobile-first social planning app: get to know a person, find compatible company, pick a shared activity, schedule a hangout, and learn from private feedback.

Built with Next.js App Router, React, TypeScript, Tailwind CSS, **Supabase** (Postgres and Auth), and **OpenAI** (structured preference extraction and embeddings).

## Quick start: explore without credentials

### How automatic planning works

Users save availability; Convene automatically fills it when a compatible person has overlapping availability. A Sunday 3–8 pm slot with coffee selected waits for a compatible nearby person, then receives a coffee event within that shared window. Users do not need to click a planning button or be online together. Default to one event per slot; no match means the slot stays pending until expiration.

Optional preferences default to “Surprise me” / “Any compatible option.” Interests, activities, acceptable meeting modes, languages, platforms, group sizes, and connection categories should allow “select all that apply.” Selected activities are alternatives, not a requirement to do all of them. Random choices always respect both users' constraints.

Saving a slot now starts matching automatically. Activities, meeting options, company preferences, interests, platforms, and exclusions support multiple acceptable choices. Language and group-size controls remain future work. Demo matching runs in memory; persistent matching uses the Supabase job queue and worker described below. See [IMPLEMENTATION.md](IMPLEMENTATION.md).

Requirements: Node.js 22 or newer and pnpm 11.19.0. Install pnpm with `npm install -g pnpm@11.19.0` if needed.

```sh
pnpm install
cp .env.example .env.local
pnpm dev
```

On PowerShell, use `Copy-Item .env.example .env.local` instead of `cp` if preferred. Open [localhost:3000](http://localhost:3000).

The default `CONVENE_MODE=demo` provides an isolated demo session. It never calls Supabase or OpenAI, even if keys are present. Demo data is held in server memory and expires after a day, a server restart, or eviction. Each browser session gets a separate fictional world; this mode is intended for local exploration, not persistent hosting.

### Try the complete loop

1. Click **Let's get to know you**, add your name, choose interests, answer the two conversational prompts, and save your preferences.
   Add your phone number with its country code. Select communication platforms and enter the requested username or number for each one. For demo testing, use fictional details such as `+1 202 555 0123` and `convene_test_user`.
2. Add a dated availability block. For a reliable seeded demo, choose a time inside **13:00–23:00 UTC** in the next 14 days, with at least 90 minutes free. Times in the UI are shown and entered in your browser's local timezone.
3. Leave the slot preferences on **Surprise me**, or select any activities, meeting options, and company preferences that work. Save it; no separate planning action is needed. The slot shows **Waiting for a match** or **Plan assigned**.
4. See the resulting plan in **My plans**, including its time, person, activity, and explanation. Open its details to cancel it.
5. In demo mode, **Past moments** includes one clearly labeled example hangout so you can try feedback immediately. In connected mode, feedback unlocks after the actual hangout ends.
6. Visit **Connections** to save a friend or block someone. A block cancels upcoming plans together; a negative “meet again” answer prevents future matching in either direction.
7. Open **My profile** to inspect private preference memories or edit onboarding answers.
8. Edit or pause waiting slots in **Availability**. Cancel an assigned plan from its details. Cancellation closes both participating slots; use **Reopen** only when you want another match. Each slot receives one event, even if time remains in its window.

### Contact details and communication

Profiles require a phone number and at least one communication method: **Phone / SMS, Discord, WhatsApp, Instagram, or Telegram**. Selecting an app reveals its required identifier field. WhatsApp uses a phone number with country code (which may differ from the main number); Discord, Instagram, and Telegram use usernames. These fields check format, not account ownership; SMS verification and platform OAuth are not implemented.

Matching selects a common enabled method with valid identifiers, preferring a shared app over Phone / SMS. This applies to in-person plans too, so participants can coordinate. Phones are not an automatic fallback if Phone / SMS was deselected. Browser/game/tool requirements are separate from communication apps.

The chosen contact appears under **How to reach…** in assigned-plan details. Contacts are stored in the owner-only profile JSON, never public person cards, AI preference input, or embeddings. Only participants receive the chosen method's identifier; the other saved identifiers stay private. Cancelled plans and blocked/declined relationships suppress contact display. Removing a selected method also stops its future display; previously copied details cannot be recalled. Completed, non-cancelled plans retain access while both participants still enable the chosen method. Seeded contacts are explicitly fictional and must not be contacted.

Existing users should edit their profile to add contact details before creating new matches. Old Browser/PC/Switch selections are not treated as communication channels; no username or number is guessed. Existing plans without a saved communication channel can show a currently shared method after both profiles have been completed.

All seeded people and venues are fictional. In connected mode, in-person matching requires a private location saved in **My profile** and enforces both users' straight-line distance limits to one another and the approximate Midtown Atlanta venue area. This does not verify actual venues, opening hours, driving distance, or reservations. Demo mode uses a city-only simulation. Users elsewhere can use online plans, which do not require location. Participants receive the selected contact method in plan details and arrange their own room or call.

## Connect Supabase and OpenAI

### 1. Create your Supabase project

Create a Supabase project, then apply the migrations in filename order: [initial schema](supabase/migrations/202609240001_initial.sql), [automatic slots](supabase/migrations/202609240002_automatic_slots.sql), [overlap protection](supabase/migrations/202609240003_availability_no_overlap.sql), and [communication contacts](supabase/migrations/202609240004_communication_contacts.sql). Use the SQL editor or your normal Supabase CLI migration workflow. Existing installations should apply only migrations they have not already run.

The fourth migration records each plan's communication channel and verifies both participants have enabled it and supplied identifiers before booking. Phone numbers and usernames use the existing private profile storage; no separate contact service or credential is needed. Re-run the seed script if you want the existing fictional pool to receive demo contact details (it also refreshes its availability as described below).

The second migration adds slot lifecycle/preferences, a partial GiST overlap index, a spatial point index, and a private durable job queue. Existing real users' slots start **paused**, because the previous build did not authorize automatic assignment; reopen them in Availability to opt in. New slots start pending.

The third migration prevents one user's pending, paused, or filled slots from overlapping, including concurrent inserts, edits, and reopening. Adjacent endpoints are allowed (3–5 pm and 5–8 pm); different users can offer the same time. Cancelled and expired slots do not block new slots. The app displays a conflict message without saving the attempted change.

If overlapping slots already exist, the migration stops without changing them. Find the conflicting pairs with this read-only SQL, edit/remove unassigned slots in Availability, or deliberately cancel an assigned plan if that is the conflict you want to remove. Then rerun the migration. If the SQL editor reports an aborted transaction, run `ROLLBACK;` first.

```sql
select a.user_id, a.id as first_slot, b.id as second_slot,
       a.start_time, a.end_time, b.start_time as other_start, b.end_time as other_end
from public.availability_blocks a
join public.availability_blocks b
  on a.user_id = b.user_id and a.id < b.id and a.during && b.during
where a.status in ('pending', 'paused', 'filled')
  and b.status in ('pending', 'paused', 'filled');
```

The migration creates user profiles, private preference memories, availability, directional connections, hangouts, participants, reservation ranges, and feedback. It enables RLS, restricts direct client access, and creates server-only transaction functions for profile updates, scheduling, and feedback.

### 2. Configure environment variables

Edit `.env.local`:

```dotenv
CONVENE_MODE=supabase
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
OPENAI_API_KEY=YOUR_OPENAI_API_KEY
OPENAI_MODEL=gpt-6-luna
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
CRON_SECRET=YOUR_LONG_RANDOM_SERVER_ONLY_SECRET
CONVENE_WORKER_URL=http://localhost:3000
```

Get your Supabase URL and keys from the project's Connect dialog / API settings. The publishable key identifies the project; the service-role key and OpenAI key are server-only secrets. Never prefix those secret names with `NEXT_PUBLIC_` or commit `.env.local`.

The embedding column is fixed at **1536 dimensions**. The integration explicitly requests that dimension; changing to an incompatible model requires a schema migration and regenerating stored embeddings. The LLM must support Responses API structured outputs. You can override the model IDs through the environment.

Preference extraction defaults to GPT-6 Luna with low reasoning effort. Other model overrides use their default reasoning settings. Embeddings use `text-embedding-3-small` independently.

When OpenAI is unavailable or returns invalid output, the app saves the user's explicit answers and shows a notice. Interest-based matching continues. It does not silently switch to another LLM provider.

### 3. Configure authentication

In Supabase Authentication:

- Enable the email/password provider.
- Set the Site URL to `http://localhost:3000` for local development, and to your HTTPS origin when deployed.
- Configure email delivery as needed. With email confirmation enabled, users sign up, click the confirmation email, then return to Convene and sign in.

Convene handles login, signup, logout, and session refresh through server route handlers with the Supabase SSR cookie client. Routes verify identity using `auth.getUser()`. No authenticated rendering takes place in Server Components, so a session-refresh proxy is not required for the current UI.

### 4. Seed the demo pool

```sh
pnpm seed
```

This creates ten fictional candidate profiles and the next 14 days of availability. If an OpenAI key is configured, it also generates their profile embeddings (a paid API call). Re-run to refresh expired seed availability. It updates only the ten fixed seed IDs and their availability, leaving real profiles alone. Existing seed hangouts remain reserved.

The seeds are database profiles, **not login accounts**. They cannot confirm attendance. They exist to demonstrate matching. Real signed-up users with saved profiles and availability can also be matched.

### 5. Run

```sh
pnpm dev
```

Restart the server after changing environment variables. With `CONVENE_MODE=supabase`, a missing configuration fails with a setup error; it never falls back to anonymous demo storage. Create an account, save a profile, and add availability to begin.

### 6. Keep automatic matching running

For connected local development, run this in a second terminal while the web server is running:

```sh
pnpm worker
```

Use a long random `CRON_SECRET` (for example, generate one with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`). Keep it server-only. The worker reads `.env.local` and calls `/api/jobs/match` every minute with `Authorization: Bearer <CRON_SECRET>`. `pnpm worker --once` runs one batch. Use HTTPS for remote `CONVENE_WORKER_URL` values.

In production, configure a scheduler to call that endpoint with the same authorization header every minute, or supervise the worker process. The migration does not provision a hosted scheduler. GET and POST are supported; unauthenticated calls are rejected. Keep the web server reachable even when users close their browsers. Size the worker cadence/concurrency to queue volume; each request processes up to ten jobs within a roughly twenty-second work budget.

Saving a slot enqueues its job in the same database transaction. A server-side `after` callback makes a best-effort immediate pass; the independent worker is required for recovery and later matching. Unmatched jobs retry every five minutes; errors back off, failed leases recover, and repeated failures wait thirty minutes before another cycle. Candidate pages contain at most 100 overlapping slots with continuation. No LLM call is needed for each matching attempt.

The UI refreshes while visible and announces newly assigned plans in-app. Assignment continues without the browser in connected mode, but push/email notifications are not implemented. Demo mode needs no worker and has no durable offline guarantee.

## Checks and production build

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm start
```

To run the HTTP smoke tests, start a server in demo mode, then run:

```sh
node scripts/smoke.mjs
```

The smoke test creates isolated fictional sessions and exercises the API. It refuses to mutate a connected-mode server. `CONVENE_TEST_URL` can override the default `http://localhost:3000`.

The domain tests cover availability intersection, conflict subtraction, cancellation, budget/platform/exclusion filters, connection consent, timezone offsets, scoring feedback, and invalid inputs. The database tests run the actual migration in local PGlite Postgres with pgvector and btree_gist, simulate Supabase roles, and verify RLS, transaction rollback, booking constraints, cancellation, feedback, and blocking. No cloud credentials are needed for these tests.

Use `pnpm format` to format implementation files, or `pnpm format:check` to check formatting. PWA icons are committed; regenerate them after editing `public/icon.svg` with `node scripts/generate-icons.mjs`.

## Project structure

```text
src/app/                   Next.js pages, API routes, manifest, and styles
src/components/            Responsive application and forms
src/lib/domain.ts          Shared types and Zod input contracts
src/lib/catalog.ts         Fictional people, activities, and venues
src/lib/planner.ts         Deterministic filtering, scheduling, and scoring
src/lib/server/            Auth, Supabase persistence, OpenAI, request handling
supabase/migrations/       Schema, RLS, and atomic transaction functions
scripts/seed.ts            Repeatable fictional candidate seeding
scripts/smoke.mjs          End-to-end API smoke checks
tests/                    Domain behavior tests
public/                   PWA icons, service worker, offline fallback
IMPLEMENTATION.md          Implementation status and remaining milestones
```

## How planning works

The worker queries pending overlapping time ranges using `&&` and a partial GiST index, checks basic eligibility, and loads only that candidate page's participants. It applies mutual slot preferences, relationship goals, geographic limits, and booking conflicts before scoring. Explicit slot activities are alternatives and override profile interest defaults, but never exclusions, budget, or required platforms. Normal UI reads are scoped to the user's slots, connections, and plans.

Valid options are scored using shared interests, optional OpenAI embedding similarity, and a small feedback adjustment. Weighted selection among top candidates and random activity tie-breaking add variety. Scheduling rechecks slot revisions, profile snapshots, availability, and relationship eligibility in a transaction; participant locks and a Postgres exclusion constraint prevent conflicting reservations. The same transaction fills both slots and links their event. Cancellation releases reservations and closes the slots without automatic rebooking.

OpenAI extracts bounded, structured preference memories with verbatim evidence. Unsupported evidence is rejected. Public summaries are generated deterministically from selected interests, so private conversational answers cannot leak through an AI summary. Feedback comments are preserved as contextual memories; ratings gently influence activity selection, and reconnection preferences control future pair eligibility. Advanced semantic memory retrieval and LLM-generated feedback patches are not yet implemented.

All mutations pass through authenticated, validated server routes. The browser receives its own private memories and feedback, and only public fields for people in its plans/connections. The service role is used only on the server for cross-user planning. Mutating requests reject cross-origin browser calls, oversized payloads, and invalid schemas. The local rate limiter is per process; use a distributed limiter before a public launch.

## PWA and deployment

The production build includes a web manifest, 192px/512px icons, and an offline fallback. The service worker is registered in production only. It caches **only the offline page and icon**, never profile data, auth responses, or plans. Installation requires HTTPS or localhost and a supporting browser.

For Vercel, import the repository, select Next.js, use `pnpm install` and `pnpm build`, and configure the same environment variables with `CONVENE_MODE=supabase`. Apply the database migration and seed separately. Set Supabase's Site URL to the deployed origin. Do not use process-local demo storage as a persistent hosted database.

## Current boundaries

- This is the first runnable MVP, not the entire long-term roadmap. See [IMPLEMENTATION.md](IMPLEMENTATION.md).
- Availability is dated, not recurring. All stored instants are UTC; inputs and display use the browser timezone.
- Connected proximity checks use private coordinates, a spatial bounding-box shortlist, and great-circle distance. Routing and verified venue coordinates are still future work; the seeded venue area is approximate.
- There are no external calendar writes, live venue searches, group plans, notifications, or reservations yet.
- “Saved friend” is a private directional list, not proof of mutual friendship. Mutual invitation/acceptance workflows are still planned.
- Feedback supports private comments, activity scoring, and connection suppression. Rich preference patching, memory deletion UI, account deletion UI, and full moderation/reporting are later milestones.
- Candidate searches are paginated by slot ID. Large participant histories, job retention/monitoring, and production-scale performance tuning still need attention before public launch.
- Live Supabase and OpenAI verification requires your project credentials. Local demo tests do not validate external service configuration.

## Design references

- [Product overview](overview.md)
- [Technical design](technical-design.md)
- [Technical requirements](technical-requirements.md)
- [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [OpenAI embeddings](https://developers.openai.com/api/docs/guides/embeddings)
- [Supabase server-side auth](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs)
