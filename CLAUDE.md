# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Convene is a mobile-first PWA that turns people's dated availability into small in-person group
hangouts. A nightly city-local batch picks the people, activity, venue, and exact time at least
48 hours ahead. The product and algorithm are specified in `overview.md`,
`technical-requirements.md`, and `technical-design.md` (sections 1 to 12 are authoritative).
`DECISIONS.md` records every judgment call made where those specs left room; read it before
changing planning, schema, or time-zone code, and add to it when you make a new call.

## Next.js version warning

This is Next.js 16 and it differs from training data: route handler `params` and `cookies()` are
async, `middleware.ts` is `proxy.ts`, Turbopack is the default, `next lint` is gone. Read the
relevant page under `node_modules/next/dist/docs/` before writing App Router code.

## Commands

```sh
pnpm install                 # pnpm 10.34.5 (npm install -g pnpm@10.34.5), pinned for Vercel
pnpm dev                     # demo mode by default: in-process PGlite, seeded, no external calls
pnpm typecheck
pnpm test                    # vitest, all files
pnpm exec vitest run src/features/planning/buckets/select.test.ts   # one file
pnpm exec vitest run src/features/planning/batch -t "catch-up"      # filter by name
pnpm build                   # production build (CONVENE_MODE=demo pnpm build works offline)
pnpm format                  # prettier; run before committing, it reflows long lines
pnpm smoke                   # HTTP end-to-end against a running demo server (CONVENE_SMOKE_URL)
pnpm e2e                     # real Chrome end-to-end against a running demo server
pnpm migrate / pnpm seed / pnpm worker   # connected mode only (CONVENE_MODE=supabase)
```

`pnpm smoke` and `pnpm e2e` refuse to run against a connected-mode server. Run them one at a time
against a freshly started server: both consume the seeded planning batch, so running them together
makes the second one see "nothing to assign". Start a server for them with
`CONVENE_MODE=demo PORT=3005 pnpm start` after a build.

Tests boot a fresh WASM Postgres per file, so the suite takes about a minute; `testTimeout` is
already raised in `vitest.config.mts` (it must be `.mts`: Node 20 cannot `require()` ESM).

## Architecture

**One SQL path, two databases.** All server code talks Postgres through the tiny `Db` interface in
`src/lib/db.ts` (`query`, `exec`, `transaction`). `db-pg.ts` backs it with `pg` against Supabase
(`DATABASE_URL`); `db-pglite.ts` backs it with in-process PGlite for demo mode and every test. The
same `supabase/migrations/*.sql` apply to both, so demo mode and tests exercise the real
transactions. Supabase JS is used only for Auth. Conventions that keep the drivers interchangeable
are documented at the top of `db.ts`: never read range columns as text, cast counts to `::int`,
pass jsonb as strings with `::jsonb`.

**Modes and providers.** `src/lib/env.ts` is the only reader of `process.env`. `CONVENE_MODE=demo`
parses no provider keys at all. `src/lib/providers.ts` selects `ai` (Meta Muse Spark plus Gemini/OpenAI embeddings, or a deterministic
fake), `venues` (Google Places or a labelled fictional provider), and `push` (web-push or a
recording fake). Each provider has exactly a real and a fake implementation under its feature
folder; tests inject the fakes.

**Deny-all RLS.** Every table has RLS enabled with no policies for the browser roles, so PostgREST
exposes nothing. Ownership and participation are enforced in the route SQL, not in policies.

**Three plpgsql functions carry the lock-sensitive transactions:** `commit_group_event`,
`withdraw_participant`, and `submit_feedback` (migrations 0009 to 0011). They raise stable error
codes (`stale_slot`, `advance_assignment`, `booking_conflict`, `event_started`, `answer_final`, ...)
that TypeScript maps to HTTP errors. Everything else is single-statement SQL in feature files.

**Event completion is derived**, never stored: `status = 'scheduled' and ends_at <= now()`.

**Planning pipeline** (`src/features/planning/`, pure TypeScript over epoch-millisecond data):
`time/segments` clips slots to a city-local day and the 48-hour cutoff; `buckets/candidates`
builds overlap buckets at every distinct segment start; `buckets/reconnection` scores friend
pairs; `buckets/select` runs the greedy selection; `groups/partition` splits buckets into groups
of two to five; `activities/ranking` validates model output against the catalog with a
deterministic fallback; `venues/plan-venue` picks venue and exact time with bounded retries.
`batch/driver.ts` orchestrates one scheduler tick: expire dead slots, claim due city batches
(`batch/due.ts`), persist proposals before any external call, commit each group, drain push jobs.
No database transaction is ever open around a model or Maps call.

**Calendar integration** (`src/features/calendar/`): Google OAuth with refresh tokens encrypted
by `src/lib/secrets.ts`, a picker over the person's calendars, busy blocks cached in `busy_blocks`
and refreshed by the tick when stale, a live re-check before every commit, and matched hangouts
mirrored into a dedicated Convene calendar (`event_calendar_entries`). Weekly availability lives in
`src/features/availability/weeks.ts` (server) and `week-grid.ts` (pure, shared with the browser);
`materializeWeeks` copies a person's latest week forward when the planner's target week is unset.
Demo mode uses `calendar/fake.ts`, whose busy pattern is fixed per weekday.

**Scheduler entry point:** `POST` or `GET /api/jobs/run` with `Authorization: Bearer CRON_SECRET`
(hidden in demo mode; `POST /api/demo/run-jobs` is the signed-in demo equivalent). `scripts/worker.ts`
calls it on a cadence. Hobby deployments require this worker or an external scheduler; the default
`vercel.json` intentionally has no built-in cron. See README for the optional Pro cron.

**Routes.** `src/app/api/**/route.ts` files are one-line re-exports. Each feature's `api.ts`
exposes a factory (for example `availabilityRoutes(deps)`) that takes the session provider,
database, clock, and providers, plus module-level exports wired to the real ones. Tests call the
factory with `stubSessionProvider` and a PGlite database from `supabase/tests/harness.ts`. Every
input schema is a strict Zod object: unknown fields are a 400, which is how removed product
controls stay out of the contract.

**Sessions.** `src/features/auth/session.ts` dispatches to Supabase SSR or the demo HMAC cookie.
Routes use `authed` / `authedMutation` from there, which also flush refreshed cookies onto the
response; `authedMutation` adds the same-origin check.

**Client.** Pages under `src/app/(app)` are one-line wrappers around client components in
`src/features/*`. `AppShell` provides `useAppState`, which polls `GET /api/state` every 30 seconds
while visible and after mutations; screens read from that state rather than fetching themselves.
Components use `window.location` for redirects and plain `<a>` or `next/link`, never `useRouter`,
so they render under `react-dom/server` in tests.

**Time zones** live in `src/lib/time.ts` (Intl only). Ambiguous wall times resolve to the later,
standard-time instant to match Postgres's `AT TIME ZONE`; a test compares the SQL and TypeScript
day bounds across nine zone/date pairs. Never add fixed 24-hour periods to cross days.

## Conventions specific to this repo

- Directory layout is by feature (`src/features/<feature>/{schemas,store,api,*.tsx}`), and every
  file under `src/features` and `src/lib` has a sibling `*.test.ts(x)` with the same name;
  migrations have `NNNN_name.test.ts` beside `NNNN_name.sql`.
- Model output is a proposal: memory extraction and activity ranking go through a loose
  model-facing schema, then a strict application schema, then catalog or evidence validation.
- Private data never leaves the owner: phones only in plan responses for non-withdrawn
  participants of non-cancelled events; memories, raw answers, and feedback answers only to their
  owner; explanations built from public interests only; model input carries aliases, not names.
- Seeded personas use `@convene.demo` emails and reserved 555 phone numbers; keep any new seed
  data obviously fictional.
- The prior implementation was removed on 2026-09-26; nothing in git history before that reflects
  the current specs.
