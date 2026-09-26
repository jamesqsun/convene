# Judgment calls

A running log of decisions the specs left open, with the reasoning. Entries are grouped by area and
added as the implementation progresses. The three spec files remain the source of truth; this file
records how gaps in them were resolved.

## How decisions were made

Each call was resolved by, in order: (1) the closest statement in `technical-design.md` sections 1
to 12, (2) the simplest implementation that keeps every acceptance check in section 12 testable,
(3) the least amount of new code. Where two readings were both defensible, the one that is easier
to reverse later won.

## Toolchain

- **Next.js 16.3.6 conventions verified from `node_modules/next/dist/docs`:** route handler
  `params` and `cookies()` are async; `middleware.ts` is now `proxy.ts` (unused here); Turbopack is
  the default and `next dev` writes to `.next/dev`; `next lint` no longer exists; `maxDuration` is
  a route segment export; `serverExternalPackages` keeps WASM and native modules out of the bundle.
- **pnpm via npm, not corepack.** The corepack bundled with Node 20.17 carries a stale registry
  signing key and cannot download pnpm. `npm install -g pnpm` works and the README documents it.
- **pnpm 12 `allowBuilds`.** Dependency build scripts are blocked until allowlisted in
  `pnpm-workspace.yaml`; esbuild, sharp, and the Tailwind oxide binary are the only ones allowed.
- **pgvector for PGlite ships separately** as `@electric-sql/pglite-pgvector` (export `vector`).
  `btree_gist` comes from `@electric-sql/pglite/contrib/btree_gist`.
- **Vitest 5 on Node 20.17.** Its bundler (rolldown) needs a native binding that pnpm 12 skipped as
  an optional dependency, so `@rolldown/binding-darwin-arm64` is pinned explicitly. The config is
  `vitest.config.mts` because Node 20.17 cannot `require()` ESM and the `.ts` name loads as CommonJS.

## Data access

- **One SQL path for both modes.** Server code talks to Postgres through a two-method `Db`
  interface backed by `pg` (Supabase) or PGlite (demo and tests). Supabase JS is used only for
  Auth. This is what makes demo mode exercise the real transactions instead of a parallel store.
- **Range columns are never read as text.** Their textual form depends on the session time zone
  (observed as `-05` offsets from PGlite on this machine). Queries select `lower()` / `upper()`.
- **Counts are cast to int in SQL** because `pg` returns bigint as a string and PGlite as a number.
- **Deny-all RLS.** Every table has RLS enabled and no policies for `anon` / `authenticated`, so
  PostgREST exposes nothing. Ownership and participation are enforced in the server's SQL. The
  spec's owner/participant access rules are satisfied at the route layer, and this avoids policy
  code that nothing exercises.

## HTTP layer

- **Origin header required on mutations.** Browsers send `Origin` on every same-origin and
  cross-origin POST/PATCH/DELETE `fetch`, so a missing header is treated as foreign. Bearer-secured
  worker calls skip the check.
- **Strict Zod schemas everywhere.** Unknown fields are a 400, which is how "removed controls are
  absent from the contract" is enforced rather than merely ignored.

## Time

- **Intl instead of a date library.** `zonedTime` uses two offset guesses; nonexistent wall times
  shift forward past the DST gap. Ambiguous wall times resolve to the later, standard-time instant
  because that is what Postgres does for `timestamp AT TIME ZONE` (verified with America/Havana,
  whose clocks fall back at midnight). The TypeScript planner and the SQL commit check must never
  disagree about a day's bounds, so Postgres's convention wins over Java's.

## Schema

- **Event completion is derived**, never stored: `status = 'scheduled' and ends_at <= now()`. The
  spec ties feedback eligibility and recency to the end timestamp regardless of when a worker runs,
  so a stored "completed" flag would only add a race.
- **Phone lives on `profiles`.** With deny-all RLS the row-level visibility argument for a separate
  table disappears; the plan-detail query is the only place that selects it.
- **Reservations and date assignments are rows that get deleted on release**, so the exclusion
  constraint and the per-date primary key stay simple and non-partial.
- **Only three plpgsql functions.** Commit, withdraw, and feedback need row locks across several
  tables; everything else is single-statement SQL from TypeScript, including the batch claim.
- **`participant_left` is deduplicated per event and recipient**, so a 4-to-3-to-2 shrink notifies
  once. In-app state shows the current headcount; a second push adds little.
- **Withdrawal from a cancelled event returns `already_cancelled`** even for a non-withdrawn member,
  and slots of remaining members are closed with status `cancelled` (the spec's "close"), so they
  must add availability again to be re-planned.

## Planning pipeline

- **Time-zone convention follows Postgres** (see Time). Verified by a test that compares
  `local_day_bounds` with the TypeScript bounds across nine zone/date pairs including Havana.
- **Group remainder rule**: fill toward four; a tail of five is kept whole rather than 4+1, so
  6 = 4+2, 9 = 4+5, 13 = 4+4+5. Final groups never exceed five even though the contract allows ten.
- **Stale embeddings are treated as absent.** The memory routes refresh embeddings synchronously;
  if that failed, the planner uses interest overlap for that person rather than a wrong vector.
- **Model output is never trusted.** Ranking is validated against the catalog and window; a
  deterministic tag-overlap fallback is merged in so there are always alternates. Explanations are
  built from public interests only; the model's rationale is stored on the proposal for debugging.
- **Failure bounding**: a proposal that cannot find a venue is marked failed; a person whose groups
  failed twice for a date is left out of further passes that date. Batches retry at most five times.
- **Crash recovery** re-claims a `running` batch whose lease is null or lapsed, keeps the same pass
  and scoring time, and commits any proposal already in `planned` before generating new groups.
- **Cutoff for clipping uses the pass's scoring time**; the commit re-checks 48 hours against the
  actual clock. A slow pass can therefore fail a group at commit, which routes it to catch-up.
- **City context for venue search is the city centroid** from profiles, never a home location.

## Notifications

- **Job attempts are counted at claim time**, so a crash mid-send still consumes an attempt.
  Backoff is 2^attempts minutes, five attempts, then `failed`. A recipient with no active device
  settles as `done` with the reason `no_device`.
- **Push TTL is 24 hours**: an assignment notice is still useful a day later, and the 48-hour rule
  guarantees the event has not started.

## Auth and profile

- **Sessions are resolved on every request** (`auth.getUser()` for Supabase, an HMAC check for
  demo) and any refreshed cookies are flushed onto the response by the `authed` wrapper, so no
  proxy/middleware file is needed for token refresh.
- **Demo sign-in is email only.** The password field is accepted and ignored; persona chips sign in
  with one tap. A forged cookie fails the HMAC and is treated as signed out.
- **The onboarding step is derived from saved fields**, never stored, so a refresh resumes at the
  right place and a profile can never be "stuck" on a stale cursor. Completion is stamped once every
  field is present; at least one interest is required.
- **The city picker never accepts free text.** The server re-resolves the chosen key and rejects
  unknown ones with 422; the dataset stays server-side.

## Memories

- **Evidence is filtered, memories with none are dropped.** Rather than rejecting a whole
  extraction because one evidence string is paraphrased, each entry is checked (case and
  whitespace insensitive) and unsupported ones removed.
- **Regeneration replaces the whole set**, including edited memories, after an explicit confirm.
  Keeping a per-memory diff would need a suppression list the spec rules out.
- **Model-facing schemas are loose, application schemas strict.** OpenAI strict JSON mode rejects
  length and range keywords, so bounds are enforced after parsing. Attributes travel as key/value
  pairs and are stored as an object.

## UI

- **Pages are client components fed by one polled read** (`/api/state`, every 30 seconds while
  visible, plus after every mutation). Plan detail reads from that state, so participant access is
  enforced once, in SQL.
- **Times are always shown in the city zone**, with the zone name where it matters, because a
  traveller's browser clock is not the plan's clock.
- **No component library and no jsdom.** Components are smoke-rendered with `react-dom/server`,
  which catches broken markup and prop wiring without a browser; interactions are covered by the
  route tests and the HTTP smoke test.
- **Redirects use `window.location`** instead of the Next router so the auth gate and forms render
  identically inside Next and inside tests.

## Seed

- **Connected reset is explicit and destructive.** `pnpm db:reset --yes` removes all Auth users
  through the Admin API and truncates the explicit Convene table list without CASCADE, preserving
  managed schemas and unrelated tables. It reuses the demo seed and deterministic embeddings;
  dates are relative to the run. Auth operations are not transactional with SQL, so failed runs
  are retried with writers stopped. This resets data, not project settings or schema drift.

- **Twelve personas across two cities**, one deliberately mid-onboarding and one (Hugo) whose
  evening window is too short to overlap anyone by an hour, so the demo shows an unmatched slot.
- **History is inserted directly**, bypassing the batch driver, with committed proposals so every
  foreign key holds and the feedback transaction creates the friendships the normal way.

## After the first end-to-end round

- **`/api/jobs/run` accepts GET as well as POST.** Vercel Cron only sends GET (and attaches the
  bearer itself); the worker script keeps POSTing. `vercel.json` schedules it every ten minutes.
- **`scroll-padding-bottom` on the document** so keyboard focus, anchors, and scroll-into-view keep
  targets clear of the fixed bottom nav. Found when a browser test's minimal scroll left the
  withdraw button under the nav.
- **Past availability is not returned to the client.** A slot whose window has ended has no
  actions and its event is no longer in the plans list, so the state read filters on `ends_at`.
  Past hangouts live on the Hangouts page.
- **Browser tests scroll targets to the centre and assert nothing overlays them**, which mirrors a
  person scrolling and turns any real overlay bug into a test failure with the covering element
  named.

## Calendar integration (added 2026-09-26, pulled forward from the deferred list at the user's request)

- **Weeks carry forward automatically.** The user chose automatic over confirm-first: when the
  planner's target week has no record for a person, their most recent week's pattern is copied
  (status `auto`) and planned. A per-person checkbox turns this off. Editing an auto week makes it
  `confirmed`, and later weeks copy from that. Expired slots count as the pattern source because
  the tick expires last week's windows before carry-forward runs.
- **Busy time is subtracted, not just drawn.** Cached busy blocks from the selected calendars are
  removed from segments before bucketing, and a live check against the provider runs right before
  each commit; a conflict marks the proposal `calendar_conflict`. A provider failure during the
  live check books anyway rather than blocking the batch.
- **Matches go to a dedicated "Convene" calendar** created in the person's Google account, never
  their primary. Entries hold the activity, venue, time, and a pointer to the app, never phone
  numbers. Withdrawal or cancellation deletes the entry on the next tick or immediately after the
  withdrawal request.
- **All calendars with a picker.** Every calendar the person can read is listed and starts
  selected; the Convene calendar itself is hidden from the picker.
- **Scope `calendar`** (full) is requested because creating a secondary calendar needs it;
  `calendar.readonly` plus `calendar.events` would not allow `calendars.insert`.
- **Refresh tokens are AES-256-GCM encrypted at rest** with a configured passphrase; demo mode
  uses a per-process one because its tokens are fake anyway.
- **Google's free/busy flag is honoured** (transparent events do not block) and all-day busy
  events block the whole local day.
- **The grid shows 06:00 to 24:00 in half-hours.** Earlier hours can be added later; the server
  accepts any clock time.
