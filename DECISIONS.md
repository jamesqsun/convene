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

- **Vercel-compatible pnpm and Hobby scheduling.** Pin pnpm 10.34.5 and retain the application
  dependency document from the old pnpm 12 lockfile, preserving resolved dependency versions.
  Vercel's parser rejects the multi-document format. Use `onlyBuiltDependencies` for the same
  build-script allowlist. Default deployment omits the ten-minute Vercel cron because Hobby rejects
  it; the existing worker or an external scheduler must invoke jobs every ten minutes. A daily
  cron would change planning behavior, so it is not substituted. Earlier pnpm 12 notes are historical.

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

- **Manual completion command.** `events:complete-all` calls the deployed secret-authenticated
  POST `/api/jobs/complete-events`. In one transaction it backdates unfinished scheduled events
  to end now, shifts their starts by the same amount, releases future reservations, and settles
  queued notifications. Filled slots and original planning-date assignments remain to prevent
  replanning; original proposed times remain in planning proposals. Cancelled and already-ended
  events are untouched. Completion and feedback still use the existing timestamp semantics.
  Previously mirrored Google Calendar entries are not rewritten by this manual command.

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

- **Manual all-batch sweep.** The secret-authenticated jobs POST accepts `allBatches: true`;
  `planning:run-all` calls the deployed server using worker URL/secret settings. It enumerates
  existing plannable batches and all local dates touched by pending availability after normal
  weekly materialization. One pass per city/date bypasses schedule delays and batch retry limits,
  while preserving real clock cutoff checks, live leases, per-user failure limits, and bookings.
  It does not extrapolate recurring availability indefinitely. Ordinary worker/cron ticks are unchanged.

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
- **Google sign-in goes through Supabase Auth's Google provider**, alongside email and password
  (added 2026-09-27). Replacing Supabase Auth with our own Google OAuth was considered and
  rejected for now: it needs its own sessions and users table, and the seeded personas, which have
  no Google accounts, could no longer sign in. Both routes are browser navigations, so failures
  redirect to `/sign-in?error=<code>` instead of returning JSON. The link is always rendered; a
  demo server answers it with `google_unavailable` rather than the page asking which mode it is in.
- **Sign-in and calendar access are separate consents**, even with the same Google client.
  Sign-in asks for identity only; the broader `calendar` scope is requested when a person chooses
  to connect a calendar.
- **The onboarding step is derived from saved fields**, never stored, so a refresh resumes at the
  right place and a profile can never be "stuck" on a stale cursor. Completion is stamped once every
  field is present; at least one interest is required.
- **The city picker never accepts free text.** The server re-resolves the chosen key and rejects
  unknown ones with 422; the dataset stays server-side.

## Memories

- **Private event feedback adds evidence-backed memories.** Completed, non-cancelled hangouts
  accept one immutable free-text answer per active participant, independently of meet-again
  answers. Save it before extraction so provider failures are retryable without losing the text.
  Only the owner's interests, activity context, and feedback go to extraction. Validate output
  and verbatim evidence, then atomically append `event_feedback` memories and recompute the
  profile vector. A locked completion marker prevents duplicate memories on concurrent retries.
  Existing memories and edits remain intact; onboarding regeneration preserves feedback memories.
  No inferred facts about other participants belong in these memories. Raw feedback is owner-only
  and the new table has deny-all RLS.

- **Feedback memory updates run after the response.** Save and acknowledge with HTTP 202, then
  use Next.js `after` within the route's duration budget to attempt the update immediately.
  Durable retry metadata lives on `event_feedback`; the existing worker claims up to two rows
  per tick with SKIP LOCKED, a ten-minute lease and an ownership token. Failures back off for
  2^attempts minutes, up to five attempts; an expired fifth attempt exposes manual retry too.
  Interrupted callbacks are recovered by the worker. Polling replaces the UI's pending state.
  This reduces submission latency without changing the model or dropping saved feedback.

- **Selectable embeddings, unchanged text provider.** `EMBEDDING_PROVIDER` chooses Gemini
  (default, preserving existing configuration) or OpenAI. Meta remains the text provider. The app,
  seed, and rebuild share this selection; only the selected key is required alongside Meta's key.
  Both embedding adapters validate and normalize 1536-dimensional vectors and never fail over to
  another embedding space. Switching providers requires `embeddings:rebuild` with writers stopped.

- **Initial migration: Muse Spark for generation, Gemini for embeddings.** Muse Spark 1.3 uses Meta's compatible
  Responses endpoint through the existing SDK, with response storage disabled. Gemini Embedding 2
  supplies normalized 1536-dimensional vectors via Google's REST API. Both keys are required
  together; neither service falls back to another embedding space on errors. Migration 0012
  invalidates legacy vectors; `embeddings:rebuild` recomputes them without altering memory text.
  Rebuild with writers stopped after switching models or using reset's deterministic demo vectors.

- **Evidence is filtered, memories with none are dropped.** Rather than rejecting a whole
  extraction because one evidence string is paraphrased, each entry is checked (case and
  whitespace insensitive) and unsupported ones removed.
- **Regeneration replaces onboarding memories**, including edited ones, after an explicit confirm;
  memories learned from event feedback are preserved.
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
- **Generated people come from fixed lists, not a model** (added 2026-09-27). `pnpm seed --people N`
  builds each person from a seeded random choice of one prepared answer per prompt, and each answer
  carries the memory it supports, so evidence is verbatim by construction. Person `i` is the same
  for every `N`, which makes reruns updates. It is a flag on the existing seed, and it reuses
  `seedDemoWorld`, so generated people take the same path as the cast. Generated people only get
  past hangouts and availability; upcoming plans are left to the real planner.

## After the first end-to-end round

- **`/api/jobs/run` accepts GET as well as POST.** Vercel Cron only sends GET (and attaches the
  bearer itself); the worker script keeps POSTing. Ten-minute Vercel scheduling is now opt-in for Pro;
  Hobby uses the worker or an external scheduler (see Toolchain).
- **`scroll-padding-bottom` on the document** so keyboard focus, anchors, and scroll-into-view keep
  targets clear of the fixed bottom nav. Found when a browser test's minimal scroll left the
  withdraw button under the nav.
- **Past availability is not returned to the client.** A slot whose window has ended has no
  actions and its event is no longer in the plans list, so the state read filters on `ends_at`.
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

## Plans and Hangouts merged into one page (added 2026-09-27)

- **The Hangouts tab is gone; past hangouts are a section at the bottom of Plans.** The user asked
  for one screen instead of two, with completed hangouts reachable without a dedicated tab. The
  feedback question ("would you meet them again?") still works the same way, just in
  `PastHangoutsSection` under Plans; it caps the initial list at three and expands on request
  rather than paginating.
- **Tapping a plan card opens a popup instead of navigating.** `PlanDetail` (venue, people,
  withdraw) now also renders inside a generic `Modal` from the plans list, so the same component
  backs both the popup and the standalone `/plans/[eventId]` page that push notifications and
  other deep links still open directly.
- **Plan cards are decorative, not photographic.** Nothing in the schema stores venue or activity
  photos, so cards use a deterministic gradient and initials-only avatars keyed by id, rather than
  fabricating placeholder imagery.
