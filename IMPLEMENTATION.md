# Convene implementation checklist

This is the working implementation tracker. Checked items are implemented; external service verification is tracked separately.

## Revised hackathon pipeline — planned, not implemented

The September 26 target in technical-design.md and technical-requirements.md supersedes the earlier product scope. Existing checked items below describe the current/previous implementation, not completion of the rework.

- [ ] Remove scheduling activity selections/exclusions, budget, group-size, platform/tool, meeting-mode, travel-radius, and connection-category controls from UI and input contracts; retain onboarding interests and answers.
- [ ] Replace multi-app contact setup with private phone-only participant coordination; remove online planning, blocking, and separate friendship invitation workflows from the revised demo scope; retain mutual per-person feedback.
- [ ] Disable immediate pair matching when the batch pipeline is enabled. Legacy-data migration policy is outside the MVP specification scope.
- [ ] Add normalized city/time-zone partitioning, daily local-date batches, late-arrival handling, and durable retry recovery.
- [ ] Enforce at least 48 elapsed hours' advance assignment (not guaranteed notification receipt) at final booking, including retries and DST boundaries.
- [ ] Generate buckets at submitted/clipped start boundaries with a 60-minute minimum; preserve full common windows.
- [ ] Select buckets by people count plus capped reconnection bonus with stable tie-breaking; recompute membership, pairs, scores, and windows after removals and discard counts below two.
- [ ] Add per-person group feedback; treat missing as no and create a unique friendship only after mutual explicit yes for the same completed event. Remove manual friend addition and seed demo friends through completed events/mutual feedback.
- [ ] Use feedback-derived friendships and completed shared-event recency for reconnection, with a stable per-pass history snapshot and creation-time fallback only for legacy history gaps.
- [ ] Add the personal connection graph with friendship indicators and lines that fade/brighten by shared-event recency without deleting established friendships or exposing private responses.
- [ ] Complete account creation/resumable onboarding for name, age, location, phone, interests, and written answers and initial memory generation.
- [ ] Show generated memory title/topic, summary, and attributes in profile with owner-only field editing and Delete; refresh affected embeddings/derived profile data. Do not add influence attributes or Use less controls.
- [ ] Apply initial 14-to-60-day pair bonus ramp (0 to 1), cap total bucket bonus at 50% of participant count, and verify pair deduplication and score boundaries.
- [ ] Enforce one event per person/planning date and per slot, including multiple-slot and cross-midnight deduplication.
- [ ] Partition buckets using normalized profile similarity plus reconnection priority into groups of 2–10 without singletons; recalculate member rankings and final group windows.
- [ ] Add structured activity ranking, activity-derived durations within shared availability, Maps venue search, and bounded fallback behavior.
- [ ] Extend atomic pair booking to all group members with stale-snapshot checks, unique planning IDs, and conflict protection.
- [ ] Implement required phone browser/PWA push: permission flow, private device subscriptions, service-worker handler, backend sender, and deduplicated post-commit assignment/cancellation jobs with bounded retries. Push targets device subscriptions, not phone numbers.
- [ ] Automatically complete non-cancelled events at their end timestamp, assume attendance once started, and reject withdrawals at or after start; unlock feedback at completion without requiring an open browser.
- [ ] Keep shared explanations limited to public interests or generic reasons; prevent disclosure of others' private memories, answers, and feedback, including paraphrases.
- [ ] Enforce latest-shared-event mutual yes for reconnection bonuses; missing/no both disable them, no finalizes that event response, and older late feedback cannot override newer results.
- [ ] Support individual withdrawals, preserve events with at least two remaining, and atomically cancel singleton events; revoke withdrawn-user contacts/feedback and meeting credit.
- [ ] Allow later memory generation to recreate deleted memories; do not implement permanent suppression for the MVP.
- [ ] Update runnable setup documentation and verify the new flow locally and against hosted services.

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

- [x] Required private phone number and multi-select communication apps with conditional username/number fields
- [x] Shared communication channel selection and transactional validation, separate from activity tools
- [x] Participant-only plan contacts; cancellation, blocking, and deselection suppress further display
- [x] Contact validation/privacy regression tests and fictional seed contacts
- [x] Browser walkthrough of conditional app identifiers and assigned-plan contacts; API smoke tests verify contact removal after cancellation
- [ ] Phone ownership verification and communication-provider OAuth

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
- Database tests execute all four migrations in PGlite with pgvector and btree_gist. They verify RLS, atomic scheduling, queue rollback, exclusive claims, expired lease recovery, stale tokens/revisions, cancellation, communication channel persistence, and browser-role access denial. A 6,000-slot `EXPLAIN (ANALYZE, BUFFERS)` fixture verifies overlap index use; this is not a production load benchmark.
- HTTP smoke checks exercise isolated demo sessions, both planning modes, concurrent requests, feedback privacy, ownership, invalid input, and cross-origin rejection.
- Browser walkthrough completed onboarding, availability, a generated plan, and post-hangout feedback. Desktop and phone layouts were inspected, including horizontal overflow.
- Automatic-slot browser walkthrough verified multi-select activities/exclusions, save-to-assignment without a planning button, unmatched waiting state, and pause controls. The 390px phone layout had no horizontal overflow. The temporary verification server was stopped afterward.
- Live Supabase Auth/email, deployed Postgres, and OpenAI API behavior are not verified without credentials. The local database tests do not replace those checks.

## External verification

- [ ] Apply all four migrations to Supabase and verify RLS/contact sharing with two accounts
- [ ] Configure CRON_SECRET and a recurring worker; verify automatic offline matching and recovery
- [ ] Verify signup, confirmation email, login, and logout against Supabase
- [ ] Run live OpenAI extraction and embedding requests with project credentials
- [ ] Deploy and verify on a phone over HTTPS

## Later milestones

- [ ] Recurring availability / calendar OAuth and synchronization
- [ ] Advanced venue verification and travel-time routing (basic live Places search is part of the revised MVP above)
- [ ] Social-time allocation across a week (group matching is part of the revised MVP above)
- [ ] Granular memory merge/archive operations and semantic memory retrieval
- [ ] Adaptive LLM follow-up conversation (current onboarding uses two written prompts)
- [ ] Advanced relationship cadence optimization (mutual per-person feedback and capped reconnection priority are part of the revised MVP above)
- [ ] Email notifications, reporting/moderation tools, and account deletion UI (phone PWA push is required for the revised MVP above)
- [ ] Production query/load tuning, UI history pagination, queue retention/monitoring, and distributed rate limiting
- [ ] International matching and translation

The first release uses dated availability and seeded venue facts. It does not make reservations or write external calendar events. Demo mode is temporary and is not a production database.
