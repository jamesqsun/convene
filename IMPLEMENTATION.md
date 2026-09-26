# Convene implementation checklist

This is the working implementation tracker. Checked items are implemented; external service verification is tracked separately.

## First working release

The automatic slot flow is implemented locally. Hosted Supabase and scheduler verification are tracked separately below.

## Priority product corrections

- [x] Document availability-driven automatic planning, unrestricted defaults, and multi-select semantics
- [x] Specify persisted slot ranges, transactional enqueueing, overlap-first filtering, and matching indexes
- [x] Add pending-slot GiST range index and indexed durable queue with unique slot/revision jobs
- [x] Implement 100-slot candidate pages before scoring; verify overlap GiST use on 6,000 synthetic slots
- [x] Replace the required planning button with automatic matching when availability is saved
- [x] Persist pending/filled/paused/expired/cancelled slot states, per-slot preferences, and event links
- [x] Add durable jobs on slot/profile/connection changes, leased claims, retries, and independent recovery worker
- [x] Atomically fill both slots once, reject stale jobs, and deduplicate retries/concurrent scheduling
- [x] Default to one event per slot; expire unmatched slots and require explicit reopening after event cancellation
- [x] Show waiting/assigned/unfilled status and announce new assignments in-app
- [x] Default activity, meeting mode, and connection preferences to “Surprise me” / “Any compatible option”
- [x] Multi-select activities, meeting modes, company, interests, platforms, and exclusions; retain scalar limits
- [x] Connected proximity shortlist with spatial GiST and mutual straight-line radius checks; demo remains city-only
- [x] Test delayed matches, expiration, edits, leases, atomic assignment, cancellation, and multi-select intersections
- [ ] Verify hosted scheduler assignment while both real users are offline and concurrent workers under load
- [ ] Add language and group-size multi-select when those workflows are implemented

## Existing implementation

- [x] Desktop/tablet sidebar scrolls in short windows with its scrollbar hidden, keeping navigation and account controls reachable

- [x] Reject overlapping availability on creation, editing, and reopening; database exclusion constraint protects concurrent writes, with adjacent windows allowed
- [x] Preserve existing overlapping data during migration and document explicit conflict cleanup

- [x] Next.js / React / TypeScript mobile-first application
- [x] Dashboard, availability, plans, connections, and profile screens
- [x] Guided onboarding and editable preferences
- [x] OpenAI structured preference extraction and embeddings (live verification pending)
- [x] GPT-6 Luna default for preference extraction with low reasoning effort
- [x] Server-side validation and authenticated API boundaries
- [x] Supabase Auth integration, Postgres migration, and row-level security
- [x] Seeded users, activity catalog, and clearly labeled fictional venues
- [x] Manual dated availability with timezone-aware display
- [x] One-on-one matching, hard filters, compatibility scoring, and weighted selection
- [x] In-person and online planning
- [x] Atomic scheduling and double-booking protection
- [x] Cancellation, feedback, and connection history
- [x] Isolated, credential-free demo mode
- [x] PWA manifest, icons, service worker, and offline fallback (phone installation pending)
- [x] Setup README and environment example
- [x] Automated domain and API tests
- [x] Local Postgres migration, RLS, reservation constraints, and transaction tests
- [x] Production build and desktop/mobile browser walkthrough

## Verification notes

- Domain tests exercise overlap, conflict subtraction, duration, exclusions, mode, budget, platforms, connections, timezone offsets, and feedback scoring.
- Database tests execute all three migrations in PGlite with pgvector and btree_gist. They verify RLS, atomic scheduling, queue rollback, exclusive claims, expired lease recovery, stale tokens/revisions, cancellation, and browser-role access denial. A 6,000-slot `EXPLAIN (ANALYZE, BUFFERS)` fixture verifies overlap index use; this is not a production load benchmark.
- HTTP smoke checks exercise isolated demo sessions, both planning modes, concurrent requests, feedback privacy, ownership, invalid input, and cross-origin rejection.
- Browser walkthrough completed onboarding, availability, a generated plan, and post-hangout feedback. Desktop and phone layouts were inspected, including horizontal overflow.
- Automatic-slot browser walkthrough verified multi-select activities/exclusions, save-to-assignment without a planning button, unmatched waiting state, and pause controls. The 390px phone layout had no horizontal overflow. The temporary verification server was stopped afterward.
- Live Supabase Auth/email, deployed Postgres, and OpenAI API behavior are not verified without credentials. The local database tests do not replace those checks.

## External verification

- [ ] Apply all three migrations to Supabase and verify RLS with two accounts
- [ ] Configure CRON_SECRET and a recurring worker; verify automatic offline matching and recovery
- [ ] Verify signup, confirmation email, login, and logout against Supabase
- [ ] Run live OpenAI extraction and embedding requests with project credentials
- [ ] Deploy and verify on a phone over HTTPS

## Later milestones

- [ ] Recurring availability / calendar OAuth and synchronization
- [ ] Live Places provider, verified venue hours, and travel-time routing
- [ ] Group matching and social-time allocation across a week
- [ ] Granular memory merge/archive operations and semantic memory retrieval
- [ ] Adaptive LLM follow-up conversation (current onboarding uses two written prompts)
- [ ] Mutual reconnection consent and relationship cadence ranking
- [ ] Push/email notifications, reporting/moderation tools, and account deletion UI
- [ ] Production query/load tuning, UI history pagination, queue retention/monitoring, and distributed rate limiting
- [ ] International matching and translation

The first release uses dated availability and seeded venue facts. It does not make reservations or write external calendar events. Demo mode is temporary and is not a production database.
