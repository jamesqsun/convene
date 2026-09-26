# Convene Technical Requirements

This document specifies the revised hackathon MVP target. It replaces the earlier immediate-matching and configurable-activity requirements. The rework is planned, not implemented; see IMPLEMENTATION.md for status and technical-design.md for the algorithm.

## 1. Product inputs and scope

- Mobile-first web app with PWA support.
- In-person hangouts only, grouped by normalized city. Assume participants can reach a venue in their city.
- Provide account creation and resumable onboarding collecting name, age, city/location, a private country-code phone number, interests, questions, and short written answers for the initial memory sketch, plus dated availability.
- Scheduling input is availability only. Convene selects company, activity, venue, and time.
- Remove activity selections and exclusions, budget selection, preferred group sizes, tool/platform selection, online/in-person selection, travel-radius controls, and connection-category selection from the revised UI and API contract.
- Phone is the sole participant coordination method. Do not require messaging-app identifiers or select a communication platform.
- Blocking and separate friendship invitation/acceptance workflows are outside this hackathon MVP; mutual per-person feedback is included. Authentication and private-data access controls remain required.
- Preserve profile interests and preference memories for embedding similarity and LLM activity reasoning.
- Keep the original memory-generation process, evidence validation, structure, and embedding derivation unchanged. This revision adds presentation and user corrections, not new extraction rules.
- Display generated memories as the primary profile content, with owner-only Edit and Delete. No Use less, devalue control, or influence attribute. Refresh affected embeddings/derived profiles and invalidate stale representations after changes; deleted memories must stop contributing to planning. Normal profile reads must not regenerate old answers into deleted memories or overwrite edits.
- Ask Would you want to meet this person again? separately for each other participant after a completed non-cancelled group hangout. Store private directional feedback uniquely by event/author/subject and validate participation.
- Treat missing feedback as no for friendship creation. Only mutual explicit yes answers for the same completed event create a unique unordered friendship and enable reconnection priority; late answers can complete the pair. Creation must be atomic/idempotent under concurrent submissions.
- Remove manual Add friend controls. Demo friends must have seeded completed-event and mutual-feedback provenance. Missing later feedback does not delete an established friendship; no additional friendship-removal workflow is added here.
- Show the owner's previously connected people in a personal graph, distinguish mutual friends, and fade lines with time since the last completed shared Convene hangout. Keep old connections visible; a new completed meeting brightens the line. Visual fading does not remove friendship or disable its reconnection bonus. Do not expose private responses or relationships between third parties.

## 2. Scheduling contract

- Persist slot ID, owner, UTC start/end timestamps, IANA time zone, lifecycle status, revision, and assigned-event link. Derive planning dates in the city's configured time zone.
- Saving availability authorizes a later automatic batch; it does not immediately generate a plan.
- Run the main batch at city-local midnight for the local date two days ahead. Monday's batch targets Wednesday.
- Enforce event start >= current booking time + 48 hours inside final scheduling. A date offset alone does not satisfy this rule.
- Query slots intersecting the target day. Clip usable segments to local-day bounds and the notice cutoff; cross-midnight slots must not be booked twice.
- Allow catch-up/retry processing only while the 48-hour notice and complete one-hour event remain feasible. Do not reshuffle committed plans for late arrivals.
- Show waiting, assigned, and unfilled states. Keep pending, filled, paused, expired, and cancelled lifecycle states.
- Cancellation closes slots; explicit reopening is required before reconsideration, subject to the notice and assignment rules.

## 3. Overlap bucket algorithm

- Minimum common availability is 60 minutes. Do not impose an hourly or half-hourly start grid.
- Evaluate every distinct submitted or clipped segment start. At start t, include people whose segment contains [t, t + 60 minutes).
- Count distinct users. Retain source slot IDs/revisions and a deterministic qualifying segment per user.
- Discard candidates with fewer than two distinct people.
- Preserve the full common window, from the latest participating start to the earliest participating end.
- Score candidates by distinct people count plus a capped reconnection bonus. Select the highest score; break ties by larger count, longest common window, earliest start, then stable IDs.
- For each unique unordered mutual friend pair, use pair_bonus = clamp((days_since_last_meeting - 14) / 46, 0, 1). Initial defaults are zero through 14 days and +1 at 60 days; they are tunable.
- Add min(sum(pair_bonuses), 0.5 * people_count) to the bucket count. With no bonuses this reduces to largest-first. Recompute unique pairs, bonuses, and the cap whenever people are removed.
- Use friendship records derived from mutual per-person yes feedback, not manual additions or the directional saved-friend list. Without both yes answers, reconnection bonus is zero. Measure elapsed days at a persisted batch scoring timestamp from the latest completed, non-cancelled shared event end, falling back to friendship creation time only for legacy history gaps (never to bypass mutual-feedback eligibility). Missing/invalid timestamps give zero bonus. Scheduled/cancelled events do not reset recency; completed group events update every participating friend pair. This is a proxy based on recorded history, not knowledge of meetings outside Convene.
- Remove selected people from all other candidates for that planning date, recompute membership/windows, discard candidates below two, and repeat.
- Buckets have no maximum size. They are provisional pools for the next selection stage.
- Enforce one assigned event per user per city-local planning date and one event per source slot. Final reservation checks also prevent conflicts across dates/batches.
- Accept that this greedy method may leave people unmatched. It does not maximize total coverage, minimize bucket count, or maximize the minimum bucket size globally.

## 4. Selection, activity, and location

- Partition each selected bucket into groups of 2–10 using profile embedding similarity. Do not assume unconstrained clustering guarantees these bounds.
- Initial algorithm: stable seed order, members ranked by mean normalized similarity to the current group plus 0.5 times mean pair reconnection bonus, application target of four, and remainder adjustment to avoid singletons. Use the same bonus snapshot as bucket scoring and normalized shared interests as fallback if embeddings are unavailable. Recompute rankings as members join; keep stable tie-breaking.
- Reconnection is a soft preference in both bucket selection and final grouping. Do not assume friends sharing a bucket will automatically share an event or force friendship chains into oversized groups. All city, time, notice, deduplication, and group-size rules still apply.
- Recompute each final group's full shared window from source availability after partitioning.
- Use relevant memories to let the LLM rank a small catalog of in-person activities suitable for a one-hour event. Validate structured IDs/duration and retain deterministic alternatives.
- Users do not choose activities, budgets, tools, or group sizes. These are not hidden required inputs to the new pipeline.
- Use Maps/Places to find a venue within the city using the group, activity, and available location context.
- Do not require travel-radius, route fairness, transportation, personal budget, or accessibility-selection workflows for this hackathon pipeline.
- Use available opening-hours facts to avoid known closed venues. Label missing data as unverified; never fabricate venue facts or imply a reservation.
- Retry alternative activities/times within bounded limits. Leave slots unfilled if no plan can be produced.
- Default final event duration is 60 minutes and must fit the whole group's availability and notice cutoff.

## 5. Infrastructure and integrations

Required stack:

- Next.js App Router, React, TypeScript, and Tailwind CSS.
- Supabase Auth and Postgres, with owner/participant RLS.
- pgvector for profile embeddings; relational columns for identity, status, timestamps, and assignments; JSONB for preference context.
- OpenAI structured output for preference extraction and activity ranking, plus embeddings.
- Maps/Places credentials for real venue search. An explicitly fictional seeded venue provider is acceptable for a demo fallback.
- A secured scheduled batch endpoint and independent recovery worker. Browser polling is not a scheduler.
- HTTPS hosting for deployed PWA features.

Persist durable city/date batch records, leases, retries, slot/profile snapshots, stable group planning IDs, and post-commit notification jobs. Serialize competing passes or use equivalent database claims.

The final transaction must revalidate all group members, slot revisions, pending state, full event containment, and 48-hour notice. Atomically create the event and all participants/reservations, fill slots, and enqueue notifications. Unique planning IDs deduplicate retries; user/date assignment and reservation constraints prevent competing bookings. Extend current pair-only scheduling to groups rather than assuming existing migrations support it.

Index pending availability ranges, owner reads, city/date eligibility, ready batch work, and participant/date assignments. Keep external API calls outside booking locks.

## 6. Contact and notification boundaries

- Normalize and privately store the phone number. Show it only to assigned participants through authenticated plan responses, never public profile cards or AI input.
- Cancelled plans stop returning participant contacts. Phone ownership verification is outside scope.
- Phone coordination does not imply SMS delivery or an SMS provider.
- Persist notification work atomically with assignment and send only after commit. Deduplicate event/recipient/type delivery jobs.
- PWA push needs user permission, device subscriptions, a service-worker handler, and a backend sender. It is not implemented yet and is separate from phone-number sharing.
- Keep in-app plan status usable when push is unavailable or permission is denied.

## 7. Configuration and verification

Keep existing server-only Supabase and OpenAI credentials, worker authentication, and explicit demo/connected modes. Add the chosen Maps provider key when implementing venue search. Final batch scheduling configuration and any new environment-variable names must be documented with the implementation; do not treat old per-minute pair-matching behavior as the new scheduler.

Never expose service-role/provider secrets in browser bundles. Validate authenticated ownership, payloads, model output, and participant-only responses. Demo mode must remain isolated from live service mutation.

Acceptance coverage must include exact 60-minute boundaries, non-round starts, singleton removal after deduplication, multiple slots for one user, stable ties, uncovered users, group remainders, local-day boundaries/DST, late arrivals, 48-hour checks on retries, stale edits, concurrent commits, rollback, and notification deduplication. Verify removed choices are absent from UI and input contracts. Hosted scheduler and external-provider verification remain separate from local tests.

Verify reconnection boundaries (14/37/60 days), unordered-pair deduplication, the 50% bucket cap, recalculation after member removal, mutual friendship eligibility, completed-event history and creation-time fallback, retry snapshot stability, and influence on final groups without overriding hard constraints.

Verify unchanged memory generation, generated-memory display, owner-only Edit/Delete and derived-data refresh; per-person feedback participation, missing-as-no, late/concurrent mutual yes and idempotent friendship creation; removal of manual additions; private personal graph data and recency fading without friendship deletion.

## 8. Deferred work

Recurring availability and calendar OAuth, online hangouts, messaging-platform integrations, configurable planning preferences, travel-time optimization, advanced social-graph optimization and friendship invitation UI, blocking/moderation product flows, reservations, advanced memory patches, international matching, and production-scale optimization are not required for this revised demo. The bounded reconnection bonus using explicit friendship records is included.

Existing runtime behavior and stored data are not changed by this specification. Plan schema/data migration explicitly before enabling the rework.
