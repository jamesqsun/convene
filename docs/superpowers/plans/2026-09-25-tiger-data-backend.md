# Tiger Data Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Convene's persistent application data to Tiger Cloud, retain Supabase Auth, and use a Timescale hypertable and continuous aggregate for matching-worker telemetry.

**Architecture:** A server-only PostgreSQL adapter connects to Tiger Cloud. Supabase remains responsible for session and identity verification; user-scoped transactions set a local database identity for RLS, while matching and seed operations use a separate worker connection. Normalized product data stays relational, and append-only matching measurements use a Tiger hypertable.

**Tech Stack:** Node.js 22+, pnpm 11.19.0, Next.js 16, TypeScript, `pg`, Supabase SSR Auth, Tiger Cloud PostgreSQL/TimescaleDB, PGlite.

**Spec:** `docs/superpowers/specs/2026-09-25-tiger-data-primary-backend-design.md`

## Global Constraints

- Server-only code connects to Tiger Cloud; browsers never receive a Tiger connection string or connect directly.
- Supabase remains the identity provider; Tiger Cloud is the only persistent application-data store; do not dual-write.
- User operations use transaction-local identity context and Tiger RLS; matching/seed code uses the separate worker database role.
- Telemetry excludes user IDs, profile fields, free-form errors, contact identifiers, and exact locations.
- Core product tables remain ordinary relational tables; only matching telemetry is a hypertable.
- Demo mode remains credential-free and never silently becomes connected mode.
- Claim no performance improvement without a measured Tiger run with a stated dataset and load profile.

## Review Focus

1. **Missing/invalid Tiger configuration or Supabase identity:** return a clear setup/auth error without falling back or querying data. Test config validation and assert `test_identity_rejects_invalid_supabase_user_without_tiger_query` observes zero Tiger queries for unauthenticated identity (Tasks 2–3).
2. **Pooled connection identity leakage:** an absent or prior user's transaction-local context must not expose rows to the next request. Test two identities and no-context reads on the same database instance (Tasks 1–2).
3. **Scheduling atomicity under retries/concurrency:** reservations, slot state, and hangout creation must roll back together and cannot double-book. Test conflicts and retries in PGlite (Tasks 1 and 4).
4. **Telemetry failure or privacy leakage:** metrics insert failure must not fail a match, and telemetry schema/queries must not include user or contact data. Test the worker failure boundary and telemetry columns/content (Task 4).
5. **Existing Supabase rows and Supabase-only auth references:** importing app data must preserve row counts and relationships without copying Auth data. Test `test_imported_rows_preserve_uuids_and_foreign_key_counts` in PGlite and include the same count/FK checks in the operator runbook (Tasks 1 and 5).

---

## File map

- `db/migrations/`: Tiger-targeted relational schema, transaction functions, roles/policies, and Timescale telemetry migration.
- `db/demo/matching-telemetry.sql`: a read-only sample query for the five-minute aggregate.
- `src/lib/server/tiger.ts`: server-only connection pools, user/worker transaction helpers, and safe database error translation.
- `src/lib/server/tiger-repository.ts`: parameterized SQL for product reads and mutations.
- `src/lib/server/matching-repository.ts`: matching job claims, candidate pages, finalization, and telemetry writes.
- `scripts/tiger-seed.ts`: deterministic seed-row mapping shared by the seed command and unit tests.
- `src/lib/server/store.ts`, `actions.ts`, `matching.ts`: preserve current app/domain interfaces while delegating persistent work to Tiger repositories.
- `src/lib/server/supabase.ts`: retain only Supabase Auth client creation.
- `scripts/seed.ts`: seed Tiger with fictional profiles and availability.
- `scripts/check-tiger.mjs`: opt-in, non-production Tiger integration check.
- `tests/database.test.ts`: run Tiger-compatible relational migrations in PGlite and validate RLS/transaction guarantees.
- `tests/tiger-connection.test.ts`: pooled transaction context, rollback, role selection, and safe error behavior.
- `tests/tiger-repository.test.ts`: exercise repository/transaction behavior against PGlite or a query-compatible test adapter.
- `tests/matching.test.ts`: worker idempotency, telemetry, and failure-boundary tests.
- `tests/tiger-seed.test.ts`: seed-row mapping and Tiger-check safety guard tests.
- `.env.example`, `README.md`, `IMPLEMENTATION.md`, `package.json`, `pnpm-lock.yaml`: setup, migration, run, and check instructions.

## Task 1: Port relational schema and database invariants

**Files:**
- Create: `db/migrations/001_core.sql`
- Create: `db/migrations/002_automatic_matching.sql`
- Create: `db/migrations/003_communication_contacts.sql`
- Create: `db/migrations/004_matching_telemetry.sql`
- Modify: `tests/database.test.ts`

**Interfaces:**
- Produces Tiger schema consumed by Tasks 2–5: application tables keep their current names/columns where portable; `app.current_user_id()` reads `current_setting('app.user_id', true)`; user RLS policies use that helper; `matching_jobs` and functions `save_convene_profile`, `schedule_convene_hangout`, `schedule_convene_slots`, `submit_convene_feedback`, `manage_convene_connection`, `update_convene_slot`, `claim_matching_job`, `matching_candidates`, and `finish_matching_job` preserve current transaction/worker behavior.
- `004_matching_telemetry.sql` is Tiger-only and is deliberately excluded from PGlite migration setup; Task 5 verifies it against a configured Tiger service.

- [ ] **Step 1: Write failing PGlite migration assertions** in `tests/database.test.ts`: `test_user_rls_requires_context_and_isolates_rows` asserts null context sees zero private rows and Alice's context sees only Alice's profile/memories and participant plans; `test_worker_role_can_process_matching_jobs` asserts the worker can claim cross-user jobs; `test_schedule_convene_hangout_is_atomic_and_rejects_overlap` asserts a rejected reservation creates no partial hangout/participant rows; `test_imported_rows_preserve_uuids_and_foreign_key_counts` copies whitelisted application rows in dependency order and asserts identical IDs/counts plus no dangling references; and existing feedback/blocking cases preserve expected status and reservation counts.
- [ ] **Step 2: Run the focused database test and confirm failure** because the Tiger migration files do not yet exist.

Run: `pnpm exec tsx --test tests/database.test.ts`
Expected: FAIL while loading missing Tiger migration files.

- [ ] **Step 3: Port the current relational migrations** into `001_core.sql` through `003_communication_contacts.sql`. Replace `auth.uid()` and `auth.users` dependencies with `app.current_user_id()` and the UUID identity column; define separate app/worker grants and policies; preserve GiST time-range indexes, exclusion constraints, and transaction boundaries.
- [ ] **Step 4: Add `004_matching_telemetry.sql`** with TimescaleDB setup, `matching_telemetry` hypertable keyed by `(occurred_at, event_id)`, and a five-minute aggregate over operation/outcome with count, average/max duration, and average queue wait. Keep this migration syntactically separate from the PGlite-compatible core migrations.
- [ ] **Step 5: Run the focused PGlite database suite and confirm it passes** for the three portable migrations.

Run: `pnpm exec tsx --test tests/database.test.ts`
Expected: PASS for migration, RLS, exclusion, rollback, and transaction assertions.

- [ ] **Step 6: Commit the schema and database tests.**

## Task 2: Add the Tiger PostgreSQL adapter and safe transaction context

**Files:**
- Create: `src/lib/server/tiger.ts`
- Create: `tests/tiger-connection.test.ts`
- Modify: `package.json`, `pnpm-lock.yaml`, `.env.example`
- Modify: `src/lib/server/config.ts`

**Interfaces:**
- `createTigerDatabase(appPool: Pick<Pool, "connect">, workerPool: Pick<Pool, "connect">): TigerDatabase` returns injectable transaction helpers for production and PGlite-backed tests.
- `TigerDatabase.withUserTransaction<T>(userId: string, fn: (tx: SqlExecutor) => Promise<T>): Promise<T>` opens a transaction, sets transaction-local `app.user_id`, commits on success, and rolls back on error.
- `TigerDatabase.withWorkerTransaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>` uses only the worker pool and never sets a user claim.
- `SqlExecutor.query<T extends QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<T>>` is the repository interface; `rowCount` remains `number | null` to match node-postgres.

- [ ] **Step 1: Write failing tests** named `test_missing_app_url_fails_before_pool_creation`, `test_user_transaction_sets_local_identity_and_commits`, `test_user_transaction_rolls_back_and_releases_client`, `test_worker_transaction_uses_worker_pool_without_user_context`, and `test_database_error_logs_only_code`. Use injected PGlite-backed pool shims and assert a second user on a reused connection cannot see the first user's rows.
- [ ] **Step 2: Run the new focused tests and confirm they fail** before the adapter exists.

Run: `pnpm exec tsx --test tests/tiger-connection.test.ts`
Expected: FAIL with missing Tiger adapter exports.

- [ ] **Step 3: Add `pg` and `@types/pg`, then implement the two pooled transaction helpers** in `src/lib/server/tiger.ts`. Use TLS settings from the Tiger connection URL, parameter binding for `set_config`, and role-specific pools; release clients in `finally` and never log connection strings or SQL values.
- [ ] **Step 4: Update config and `.env.example`** with server-only `TIGER_DATABASE_URL` and `TIGER_WORKER_DATABASE_URL`, retaining Supabase URL/publishable key for Auth and removing the service-role key from data setup.
- [ ] **Step 5: Run focused adapter tests and typecheck.**

Run: `pnpm exec tsx --test tests/tiger-connection.test.ts && pnpm typecheck`
Expected: PASS with no connection work performed when configuration is missing.

- [ ] **Step 6: Commit the adapter and configuration.**

## Task 3: Move product reads and user mutations to Tiger SQL

**Files:**
- Create: `src/lib/server/tiger-repository.ts`
- Create: `tests/tiger-repository.test.ts`
- Modify: `src/lib/server/store.ts`
- Modify: `src/lib/server/actions.ts`
- Modify: `src/lib/server/supabase.ts`
- Modify: `src/lib/server/config.ts`

**Interfaces:**
- Repository functions accept a `SqlExecutor` and authenticated `userId`; they do not create pools or infer identity.
- `loadData(userId, mode)` and `toState(data, userId, mode)` preserve their current public signatures and returned `Data`/`AppState` shapes.
- User mutations run inside `withUserTransaction(userId, ...)`; cross-user state changes use the same constrained SQL functions currently called as Supabase RPCs.

- [ ] **Step 1: Add failing repository tests** named `test_load_data_is_owner_scoped`, `test_plan_contacts_are_participant_only`, `test_profile_and_availability_mutations_are_transactional`, `test_feedback_is_saved_once_after_hangout`, `test_blocking_cancels_future_shared_plans`, and `test_identity_rejects_invalid_supabase_user_without_tiger_query`, using the Tiger relational schema in PGlite plus an injected Supabase identity stub.
- [ ] **Step 2: Run the focused tests and confirm they fail** because repository functions are missing.

Run: `pnpm exec tsx --test tests/tiger-repository.test.ts`
Expected: FAIL with missing repository functions.

- [ ] **Step 3: Implement parameterized reads and row mappers** in `tiger-repository.ts`; retain the existing bounded page sizes and preserve private-field projections.
- [ ] **Step 4: Implement writes through transactional SQL functions** and update `store.ts`/`actions.ts` to use `withUserTransaction`; keep demo mode in-memory and unchanged.
- [ ] **Step 5: Remove `adminClient()` and PostgREST usage from user-facing data paths** while retaining `authClient()` for auth routes and `identity()`.
- [ ] **Step 6: Run repository/database tests and typecheck.**

Run: `pnpm exec tsx --test tests/database.test.ts tests/tiger-repository.test.ts && pnpm typecheck`
Expected: PASS with no `@supabase/supabase-js` data query in user-facing repository paths.

- [ ] **Step 7: Commit Tiger-backed product reads and writes.**

## Task 4: Move matching worker and telemetry to Tiger

**Files:**
- Create: `src/lib/server/matching-repository.ts`
- Create: `tests/matching.test.ts`
- Modify: `src/lib/server/matching.ts`
- Modify: `src/app/api/jobs/match/route.ts`

**Interfaces:**
- `claimMatchingJob(tx: SqlExecutor): Promise<MatchingJob | null>` claims one leased job.
- `loadMatchingData(tx: SqlExecutor, slots: Availability[]): Promise<Data>` preserves current bounded data loading.
- `finishMatchingJob(tx: SqlExecutor, job: MatchingJob, cursor: string | null, failed: boolean): Promise<void>` preserves retry/cursor behavior.
- `recordMatchingTelemetry(tx: SqlExecutor, event: MatchingTelemetry): Promise<void>` writes only bounded, non-identifying fields and is best effort.
- `runMatchingJobs(limit?: number): Promise<{ processed: number; assigned: number }>` keeps its current external signature.

- [ ] **Step 1: Write failing tests** named `test_matching_uses_worker_role`, `test_job_claim_is_exclusive`, `test_retried_job_creates_at_most_one_hangout`, `test_terminal_event_records_bounded_latency_fields`, and `test_telemetry_failure_does_not_fail_assignment`. Assert telemetry has only operation, outcome, elapsed time, queue wait, candidate count, and attempt; assert it has no user/contact values.
- [ ] **Step 2: Run the focused worker tests and confirm they fail** because Tiger matching repository functions are missing.

Run: `pnpm exec tsx --test tests/matching.test.ts`
Expected: FAIL with missing matching repository functions.

- [ ] **Step 3: Implement matching SQL repository operations** for claim, source slot, 100-row candidate continuation, atomic schedule, job finish, and retry; use `withWorkerTransaction` only in worker paths.
- [ ] **Step 4: Instrument terminal job outcomes** with elapsed time, queue wait from `next_attempt_at` to claim time, candidate count, attempt count, bounded operation/outcome values, and no user identifiers. Catch telemetry errors separately so they cannot change job finalization or assignment outcome.
- [ ] **Step 5: Update the worker route** to require connected Tiger configuration while continuing to verify `CRON_SECRET`; remove Supabase-specific mode/error wording.
- [ ] **Step 6: Run focused matching/database tests and typecheck.**

Run: `pnpm exec tsx --test tests/matching.test.ts tests/database.test.ts && pnpm typecheck`
Expected: PASS with no Supabase database RPCs left in matching code.

- [ ] **Step 7: Commit worker persistence and telemetry.**

## Task 5: Move seeding, add migration runbook, and verify Tiger-specific features

**Files:**
- Modify: `scripts/seed.ts`
- Create: `scripts/tiger-seed.ts`
- Create: `scripts/check-tiger.mjs`
- Create: `db/demo/matching-telemetry.sql`
- Modify: `package.json`, `README.md`, `IMPLEMENTATION.md`, `.env.example`

**Interfaces:**
- `pnpm seed` uses `TIGER_WORKER_DATABASE_URL` and remains safe to rerun for the fixed fictional seed IDs.
- `buildTigerSeedRows(data: Data, embeddings: number[][]): TigerSeedRows` in `scripts/tiger-seed.ts` creates deterministic profile/availability row arrays consumed by the seed command and tests.
- `pnpm tiger:check` requires `TIGER_TEST_DATABASE_URL` naming a database ending in `_test`; it checks required extensions, applied schema, RLS identity isolation, hypertable, continuous aggregate refresh/query, and a synthetic telemetry insert/cleanup. It refuses to connect to a database without the `_test` suffix.
- The runbook includes a Supabase-data export/import path that preserves UUIDs, excludes Auth tables, pauses matching workers during cutover, and verifies table counts/foreign keys before switching the application.

- [ ] **Step 1: Add failing tests** named `test_seed_rows_keep_only_fixed_seed_ids_and_optional_embeddings`, `test_tiger_check_requires_test_url`, and `test_tiger_check_refuses_non_test_database_name`; run the CLI tests with its environment stripped so they require no external service.
- [ ] **Step 2: Run the focused tests and confirm they fail** because the Tiger seed/integration checks are absent.

Run: `pnpm exec tsx --test tests/tiger-seed.test.ts`
Expected: FAIL with missing Tiger seed/check helpers.

- [ ] **Step 3: Convert `scripts/seed.ts` to parameterized Tiger SQL** using the worker role; preserve optional OpenAI embeddings and avoid changing real profiles or non-seed availability.
- [ ] **Step 4: Add `scripts/check-tiger.mjs` and `db/demo/matching-telemetry.sql`**. Require a database name explicitly marked for testing; insert a synthetic event, refresh/query the five-minute aggregate, then delete the synthetic row and refresh the affected bucket.
- [ ] **Step 5: Document Tiger service provisioning, required extensions, role grants, Supabase Auth configuration, schema migration order, one-time Supabase data copy/cutover, worker setup, and demo-vs-connected behavior.** Update the implementation tracker so unverified live checks remain unchecked until run with real credentials.
- [ ] **Step 6: Run all local tests, typecheck, and production build.**

Run: `pnpm test && pnpm typecheck && pnpm build`
Expected: PASS without Tiger credentials; `pnpm tiger:check` exits with setup instructions when `TIGER_TEST_DATABASE_URL` is unset.

- [ ] **Step 7: Commit the Tiger setup, migration, seed, and verification documentation.**

## Completion checklist

- [ ] `rg -n 'adminClient|\.from\(|\.rpc\(' src/lib/server scripts/seed.ts src/app/api` finds no Supabase PostgREST data paths; Supabase Auth usage remains.
- [ ] `pnpm test`, `pnpm typecheck`, and `pnpm build` pass.
- [ ] `pnpm tiger:check` passes on a non-production Tiger service before claiming connected-mode or Tiger-specific performance verification.
- [ ] Working tree is clean after task commits.
