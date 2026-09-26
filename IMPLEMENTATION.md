# Convene implementation checklist

This is the working implementation tracker. Checked items are implemented; external service verification is tracked separately.

## First working release

- [x] Next.js / React / TypeScript mobile-first application
- [x] Dashboard, availability, plans, connections, and profile screens
- [x] Guided onboarding and editable preferences
- [x] OpenAI structured preference extraction and embeddings (live verification pending)
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
- Database tests execute the unchanged migration in PGlite with pgvector and btree_gist. They simulate Supabase auth roles and verify private-row visibility, denied client writes/RPCs, atomic scheduling, cancellation, duplicate feedback rejection, and blocking.
- HTTP smoke checks exercise isolated demo sessions, both planning modes, concurrent requests, feedback privacy, ownership, invalid input, and cross-origin rejection.
- Browser walkthrough completed onboarding, availability, a generated plan, and post-hangout feedback. Desktop and phone layouts were inspected, including horizontal overflow.
- Live Supabase Auth/email, deployed Postgres, and OpenAI API behavior are not verified without credentials. The local database tests do not replace those checks.

## External verification

- [ ] Apply migration to a Supabase project and verify RLS with two accounts
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
- [ ] Notifications, reporting/moderation tools, and account deletion UI
- [ ] Production candidate-query pagination and distributed rate limiting
- [ ] International matching and translation

The first release uses dated availability and seeded venue facts. It does not make reservations or write external calendar events. Demo mode is temporary and is not a production database.
