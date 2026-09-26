# Tiger Data Primary Backend Design

## Goal

Move Convene's application data from Supabase Postgres to Tiger Cloud while retaining Supabase Auth. Use Tiger Data's time-series features for privacy-conscious matching operations telemetry that can demonstrate the product's performance and reliability.

## Current state

- `src/lib/server/supabase.ts` creates both the Supabase Auth client and a service-role data client.
- `src/lib/server/store.ts`, `actions.ts`, and `matching.ts` use Supabase PostgREST queries and RPCs for profiles, availability, connections, plans, feedback, and matching jobs.
- SQL migrations under `supabase/migrations/` depend on Supabase schemas, roles, RLS, and `auth.users`.
- Demo mode is in-memory and remains available for credential-free local exploration.

## Selected architecture

Supabase remains the identity provider. The application verifies sessions with `authClient().auth.getUser()` as it does today. Tiger Cloud becomes the only persistent store for application tables. Server-only code connects to Tiger Cloud over PostgreSQL; browsers never receive a Tiger connection string or connect to Tiger directly. There is no ongoing dual-write path.

Use a small PostgreSQL access layer with parameterized SQL and a pooled Node.js driver. Keep database transactions and cross-user scheduling invariants in SQL functions/transactions rather than splitting them across application round trips. Preserve the existing domain model and API request/response shapes so this change does not alter the user-facing product flow.

Tiger's application tables remain ordinary relational tables. Add a separate append-only Timescale hypertable for matching-worker measurements; availability and reservation ranges are transactional domain data and must not be converted to hypertables. Tiger Cloud provides TimescaleDB and `btree_gist`; vector support must be enabled on an AI-focused service before applying the vector column migration.

## Data and security boundaries

- Add `TIGER_DATABASE_URL` for the web application's database role and `TIGER_WORKER_DATABASE_URL` for the trusted worker/seed role. Both are server-only secrets and use TLS. The web role receives only the grants required by user-facing operations; the worker role receives the additional cross-user matching and maintenance grants it needs.
- Keep Supabase URL and publishable key for server-side Auth. Remove `SUPABASE_SERVICE_ROLE_KEY` from application data access and seeding once the Tiger path is complete.
- The Tiger `users.auth_id` column stores the Supabase Auth UUID but has no foreign key to `auth.users`, because that schema remains in Supabase. New real-user rows must have `auth_id = id`; seeded fictional users have no auth identity. Authenticated requests must verify the Supabase user before opening user-scoped database work.
- Keep private contact fields in owner-only profile storage. Continue returning only the selected contact channel to participants of an eligible hangout. Preserve cancellation, blocking, and connection checks.
- Carry the existing ownership and participant access rules to Tiger. Use a transaction-local authenticated-user context and Tiger RLS policies for user-scoped operations. The separate trusted worker role is used only by matching-worker and seed code; its URL is never available to user-facing request paths or the browser.
- Keep all SQL parameterized. Do not pass private profile text, contact identifiers, or exact coordinates into telemetry.

## Tiger Data telemetry

Add an append-only `matching_telemetry` hypertable with a non-null `occurred_at` time dimension and a composite key that includes that time dimension. Record one terminal measurement per matching job with bounded fields such as operation, outcome, elapsed milliseconds, queue-wait milliseconds, candidate count, and attempt number. Measure queue wait from the persisted `next_attempt_at` value to the worker's claim time, including for retry attempts. Do not store user IDs, profile fields, free-form error messages, or contact/location data.

Add a five-minute continuous aggregate grouped by time bucket, operation, and outcome. It provides job counts, average/max elapsed time, and average queue wait for operational review and competition demonstration. The hypertable is supplementary observability data: failure to write telemetry must not roll back or prevent a valid match. No end-user metrics dashboard is part of this database migration.

## Schema and migration

Create Tiger-targeted, ordered SQL migrations in `db/migrations/`; do not apply the current Supabase migrations to Tiger unchanged. Port the relational schema, checks, indexes, range exclusions, and transactional scheduling logic. Replace Supabase-specific `auth.uid()`, `auth.users` foreign keys, schema-qualified extension assumptions, roles, and grants with Tiger-compatible equivalents and the app/worker roles above.

Provide a documented one-time path to copy existing application rows from Supabase Postgres to Tiger while preserving UUIDs and relationships. Do not migrate Supabase Auth data. The import must validate row counts and foreign-key consistency before the application is switched to Tiger. If no source data or credentials are supplied, a fresh Tiger schema plus the existing fictional seed data is sufficient for local/demo use; live data migration remains an operator-run step.

## Application changes

- Add a server-only Tiger connection pool and transaction helpers.
- Replace Supabase PostgREST reads/writes and RPC calls in the store, mutation, matching-worker, and seed paths with repository functions backed by Tiger SQL.
- Retain the Supabase SSR client only for authentication routes and session verification.
- Update `.env.example`, README setup, worker instructions, and deployment guidance for Tiger Cloud and Supabase Auth.
- Add a guarded integration command that checks connectivity, required extensions, migrations, RLS, hypertable creation, continuous aggregate refresh/query, and seeded matching telemetry. It must not require Tiger credentials for the regular local unit/database test suite.

## Failure behavior

- Missing or invalid Tiger configuration returns a clear setup error in connected mode; it must never silently fall back to demo storage.
- A Tiger transaction failure returns the existing generic database-unavailable response and logs only a safe database code, not SQL parameters or provider messages containing user data.
- Matching remains transactionally correct if telemetry insertion fails. The telemetry failure is logged without exposing user data and does not cause a retry that could duplicate an assignment.
- Supabase Auth failures remain authentication failures and do not reach Tiger data queries.

## Validation and acceptance criteria

1. Demo mode continues to work without Tiger, Supabase, or OpenAI credentials.
2. Connected mode authenticates through Supabase Auth and reads/writes all application tables only in Tiger Data.
3. Profile, availability, scheduling, cancellation, feedback, connection/blocking, contact visibility, and worker flows preserve their current behavior and transactional guarantees.
4. Tiger RLS denies a user-scoped query without a valid transaction-local user context and prevents reading another user's private rows.
5. The worker can process cross-user matches only through its server-only worker role; concurrent and retried jobs still produce at most one plan.
6. Matching jobs emit bounded telemetry; a Tiger continuous aggregate reports counts and latency buckets without containing user or contact data.
7. Existing local tests cover domain behavior and SQL invariants. A separate opt-in integration check verifies Tiger-specific extension and hypertable behavior against a configured Tiger service.
8. No performance improvement is claimed without measurements from the connected Tiger service using a stated dataset and request/load profile.

## Out of scope

- Replacing Supabase Auth.
- Dual-writing application data to Supabase and Tiger.
- Converting core availability, reservation, or profile tables into hypertables.
- Adding user-facing analytics dashboards, calendar/venue integrations, notifications, or new matching behavior.
- Provisioning a Tiger Cloud account/service or moving production data without operator credentials.
