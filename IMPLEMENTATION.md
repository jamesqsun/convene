# Convene implementation status

The September 26 target in [technical-design.md](technical-design.md) and
[technical-requirements.md](technical-requirements.md) is implemented from scratch. Checked items
are implemented and covered by automated tests; hosted verification needs project credentials and is
listed separately. Judgment calls are in [DECISIONS.md](DECISIONS.md).

## Revised hackathon pipeline

- [x] Scheduling input is availability only; activity, budget, group-size, platform, mode, radius,
      and connection-category controls are absent from the UI and rejected by strict input schemas.
- [x] Private phone-only coordination; no messaging-app identifiers; no blocking or friendship
      invitation workflows.
- [x] No immediate matching: saving availability only authorizes a future batch.
- [x] City partitioning with a normalized key and per-city time zone snapshot; daily local-date
      batches at local midnight targeting the date two days ahead; hourly catch-up passes; durable
      batch rows with leases, passes, attempts, persisted scoring time and history snapshot.
- [x] 48 elapsed hours of advance assignment enforced at commit, including retries and DST days.
- [x] Buckets at submitted or clipped start boundaries with a 60-minute minimum and full common
      windows; identical candidates collapse; distinct people counted, one segment per person.
- [x] Greedy selection by people count plus capped reconnection bonus, stable tie-breaking,
      recomputation after every removal, discard below two.
- [x] Per-person feedback keyed by event, author, and subject; missing treated as no; one friendship
      per unordered pair created atomically on the second explicit yes; no manual friend addition;
      demo friendships seeded through completed events and mutual feedback.
- [x] Feedback-derived friendships and latest completed shared event recency for reconnection,
      creation-time fallback only for legacy gaps, per-pass snapshot for retry stability.
- [x] Personal connection graph with friendship indicators and lines that fade with recency but
      never disappear; no third-party relationships or private answers exposed.
- [x] Account creation and resumable onboarding (name, age, city, phone, interests, three written
      answers) with initial memory generation and verbatim evidence validation.
- [x] Profile shows generated memories with title, summary, and attributes; owner-only Edit and
      Delete; derived embeddings refreshed synchronously; no influence or "use less" controls.
- [x] 14-to-60-day pair bonus ramp, 50 percent bucket cap, unique-pair deduplication.
- [x] One event per person per planning date and per slot, including cross-midnight slots.
- [x] Bucket partition into groups of two to five (target four, no singletons) by similarity plus
      reconnection; final group windows recomputed from source segments.
- [x] Structured activity ranking with server-side validation and deterministic fallback;
      activity-derived durations; venue search behind a provider interface (Google Places or the
      labelled fictional provider); bounded retries.
- [x] Atomic group booking with stale-revision checks, stable planning ids, city, date, and
      reservation conflict protection.
- [x] Web push: permission flow, per-device subscriptions, service-worker handler, backend sender
      with deduplicated post-commit jobs, per-device delivery tracking, retirement on 404/410, and
      bounded retries.
- [x] Events complete automatically at their end time (derived); withdrawal rejected at or after
      the start; feedback unlocks at completion without an open browser.
- [x] Explanations built from public interests only; model input excludes names, ids, phones,
      locations, evidence, raw answers, and feedback.
- [x] Latest-shared-event mutual yes required for the bonus; explicit no is final; older late
      feedback cannot override newer events.
- [x] Individual withdrawals keep events with two or more remaining, cancel singleton events, and
      revoke withdrawn users' contact and feedback access.
- [x] Deleted memories may be recreated by a later generation; no suppression list.
- [x] Runnable setup documentation and a local end-to-end smoke test.

## Calendar integration (added after the first release)

- [x] Weekly availability grid (Monday to Sunday, half-hour cells, city time zone) saved as dated
      slots with diffing against existing pending, paused, and filled slots.
- [x] Automatic carry-forward of the most recent week when the planner's target week is unset,
      with a per-person off switch and a chain that follows edited weeks.
- [x] Google OAuth connection with encrypted refresh tokens, calendar picker over all readable
      calendars, cached busy time refreshed by the tick, and manual sync and disconnect.
- [x] Busy time subtracted from availability before bucketing and re-checked live before commit.
- [x] Matched hangouts written to a dedicated Convene calendar and removed on withdrawal or
      cancellation; plan detail shows the calendar status.
- [x] Fake calendar provider for demo mode with two fictional calendars and a weekly busy pattern;
      Maya and Ben are connected by the seed.

## Verification performed

- `pnpm typecheck`, `pnpm test` (346 tests across pure logic, migrations in PGlite, routes, and
  components), and `pnpm build` pass.
- `pnpm smoke` against the production build in demo mode: persona sign-in, batch planning, plan
  detail with phones, withdrawal and access revocation, final feedback answers, graph, fresh
  sign-up through onboarding, memory generation, edit, and delete, availability waiting state, and
  PWA assets.
- `pnpm e2e` drives the real UI in the locally installed Chrome at phone width: persona sign-in,
  the demo planning button and assignment banner, plan detail with phone links, withdrawal through
  the confirm dialog, memory edit and delete, feedback answers, the graph, and a new account through
  every onboarding step. It fails on any page or console error; none occur.

## Hosted verification (needs credentials)

- [ ] Apply migrations to a Supabase project and seed; sign up with email confirmation.
- [ ] Run a real OpenAI extraction and ranking and a real Google Places search.
- [ ] Configure a cron for `POST /api/jobs/run` and observe a batch assign plans while every user
      is offline.
- [ ] Install on a phone over HTTPS and receive assignment and cancellation pushes.
- [ ] Connect a real Google account, see its busy time on the grid, and find an assigned hangout
      in the Convene calendar.

## Deferred

Recurring availability and calendar sync, online hangouts, messaging integrations, configurable
planning preferences, travel-time optimization, friendship invitation UI, blocking and moderation,
reservations, advanced memory patches, international matching, and production-scale tuning.
