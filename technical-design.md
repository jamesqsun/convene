# Convene Technical Design

## Status and scope

This is the agreed hackathon MVP target as of September 26, 2026. It supersedes the previous immediate, preference-filtered, one-on-one planning design. The application has not yet been migrated to this pipeline; README.md describes the current runnable implementation and IMPLEMENTATION.md tracks the rework.

Users provide a profile, city, private phone number, and dated availability. For scheduling, they only submit availability. Convene chooses the people, activity, venue, and exact event time.

The MVP is in-person only. Phone is the sole participant coordination method. Remove activity selections/exclusions, budget controls, preferred group sizes, tools/platform choices, online/in-person choices, travel-radius controls, and connection-category choices from the target planning flow. Blocking and relationship-consent workflows are outside this hackathon scope. These removals simplify product inputs; authentication, private-data boundaries, and transactional booking remain required.

Retain onboarding interests and answers as inputs to profile embeddings and preference memories. They are context for selection and activity planning, not per-slot activity controls.

## 1. Pipeline

```text
Daily planning batch
 -> Load eligible pending availability
 -> Partition by city and local event date
 -> Generate candidate overlap buckets with at least 60 minutes
 -> Select highest-scoring bucket (people count + capped reconnection bonus), remove its people, repeat
 -> Split each selected bucket into similar groups
 -> Rank activities using relevant memories
 -> Find a venue using city, participant locations, activity, and Maps
 -> Choose exact event time within the group's shared window
 -> Revalidate and atomically persist the event
 -> Notify participants after commit
```

Buckets are scheduling pools, not final hangout groups. Buckets have no maximum size; final groups contain 2–10 distinct people. The algorithm favors large pools for similarity grouping and does not guarantee maximum participation, minimum bucket count, or the largest possible minimum bucket size.

## 2. Availability and notice

Store slots using full timestamps rather than independent date and time fields:

```text
id
user_id
starts_at              UTC timestamp
ends_at                UTC timestamp
timezone               IANA time zone for display and date interpretation
status                 pending | filled | paused | expired | cancelled
revision               incremented on changes
assigned_event_id      nullable
```

City belongs to the user profile; use a normalized city identifier and a configured planning time zone per city. Persist the city and time-zone snapshot used by the batch. Store time windows as half-open ranges [start, end); require start < end. Do not merge separate availability submissions into a longer authorization implicitly.

Saving a slot authorizes automatic assignment in a future batch, not immediate matching. The UI should show that the slot is waiting for its planning batch and when that batch is expected. Users can edit or pause unassigned availability. Edits invalidate stale planning snapshots.

Run the main batch at local midnight for each city and target the local date two calendar days ahead. Monday at midnight processes Wednesday. Construct date boundaries in the city's time zone, then convert to UTC; do not derive local calendar dates by adding fixed 24-hour periods across daylight-saving transitions.

At final booking enforce:

```text
event.starts_at >= booking_time + 48 hours
```

This is an absolute elapsed-time guarantee, not merely a date-label comparison. The daily batch normally gives roughly 48–72 hours of notice. Delayed processing, retries, and daylight-saving changes must still satisfy the booking-time check.

Query slots that intersect the target local day, not only slots whose start falls on that day. Clip candidate windows to that day's boundaries and to the current 48-hour cutoff. The clipped starts become candidate start boundaries too. For this MVP, events fit within a single city-local event date; cross-midnight slots may contribute a segment to either date but may only be filled once.

Late submissions can join a catch-up pass only while a complete one-hour event can still satisfy the notice requirement. Catch-up passes process only unassigned people and slots; they do not reshuffle committed events. If no valid window remains before the cutoff, leave the slot visibly unfilled and eventually expire it.

## 3. City partitioning

Group in-person availability by normalized city and local event date. For the hackathon, assume participants can reach a selected venue within their city. Do not enforce travel-radius, routing-fairness, transportation, or user budget constraints. Online planning and cross-city matching are outside scope.

City matching is an approximation, not proof of travel feasibility. Locations can help pick a sensible venue within the city, without introducing new user controls. Exact participant locations remain private.

## 4. Candidate overlap buckets

Use a minimum shared duration of exactly 60 minutes for eligibility. This is not an hourly start-time grid and does not restrict the full bucket window to one hour.

For the city's eligible availability segments:

1. Collect each distinct segment start time.
2. At each start t, collect segments that contain [t, t + 60 minutes).
3. Count distinct user IDs, not slot rows. If a user has more than one qualifying segment, select one deterministically (latest end, then stable slot ID) and retain its source slot ID/revision.
4. Discard candidates containing fewer than two distinct people.
5. Store the candidate's participants, source slots/revisions, and full common window:

```text
shared_start = maximum participating segment start
shared_end   = minimum participating segment end
shared_end - shared_start >= 60 minutes
```

Checking submitted or clipped start boundaries is sufficient: every group's common window begins at its latest member's start. Checking arbitrary minutes between boundaries cannot introduce a new participant. The simple implementation scans segments at each boundary; a sweep-line implementation is optional later.

Candidate buckets may share people. They are alternatives under consideration, not assignments. Identical participant/source-slot candidates can be collapsed to one record.

## 5. Count-based bucket selection with reconnection priority

Prefer opportunities for existing friends to reconnect. Use an explicit mutual friendship record with a unique normalized unordered user pair and friendship creation time. Seeded mutual friendships are sufficient for the demo; the current private directional saved-friend list does not establish mutual friendship. A full invitation/acceptance UI remains deferred.

For each unique friend pair in a candidate bucket, calculate:

```text
reference_time = latest completed, non-cancelled shared event end
                 (friendship creation time if there is no such event)
days_since_last_meeting = max(0, (batch_scoring_time - reference_time) / 24 hours)
pair_bonus = clamp((days_since_last_meeting - 14) / 46, 0, 1)

bucket_bonus = min(sum(pair_bonus for unique friend pairs), 0.5 * people_count)
bucket_score = people_count + bucket_bonus
```

The initial tunable defaults give no bonus for the first 14 days and reach +1 per pair at 60 days. The total bonus is capped at 50% of the distinct participant count so dense friendship groups cannot accumulate an unbounded advantage. Non-friends receive zero bonus. Use one persisted scoring timestamp/history snapshot per planning pass so retries and tie-breaking remain reproducible. Missing or invalid friendship/history timestamps yield zero bonus rather than invented elapsed time.

Only completed, non-cancelled events ending by the scoring timestamp reset recency; creating, scheduling, or cancelling an event does not. A completed group event counts as a shared meeting for every friend pair among its participants. This is recorded Convene history, not proof that participants attended or that they have not met outside the app. Friendship creation is a documented fallback, not a claim of an actual meeting.

Examples: six people with no bonus score 6; five people with 1.5 summed pair bonuses score 6.5; three people with 3 summed pair bonuses score 4.5 after the cap. Thus a slightly smaller bucket can win. With all bonuses zero, selection reduces to largest-first.

Repeatedly:

1. Choose the candidate with the highest bucket_score among distinct unassigned people.
2. Break ties by larger participant count, longest common window, earliest start, then stable sorted participant/source-slot IDs.
3. Save that selected bucket as a provisional planning pool.
4. Remove its people from all remaining candidates for the city-local planning date.
5. Recompute remaining membership, unique friend pairs, reconnection bonus and cap, full shared windows, and tie-break scores. Discard candidates with fewer than two people.
6. Stop when no candidate has at least two people.

The MVP permits at most one assigned hangout per person per city-local event date and at most one event per availability slot. Multiple submitted slots must not give one person multiple places in the pool. Existing committed assignments are excluded before bucket generation. Cross-date slot reuse and overlapping events remain prohibited at commit time.

Example with a 60-minute minimum:

| Person | Availability |
|---|---|
| A | 11:10–15:00 |
| B | 11:40–14:00 |
| C | 12:00–15:30 |
| D | 14:00–16:00 |
| E | 14:15–16:00 |

Assuming no reconnection bonuses, candidates include A/B/C at 12:00 with a full shared window of 12:00–14:00, and A/C/D at 14:00 with a shared window of 14:00–15:00. Both score three; the longer-window tie-break selects A/B/C. Removing those people leaves D/E with a full shared window of 14:15–16:00.

Every selected bucket has at least two people. Some people may remain unmatched even when a different arrangement could include them. Greedy count-plus-reconnection selection is a deliberate complexity tradeoff, not a global optimization guarantee. Bonuses never bypass common availability, city, notice, group-size, or booking constraints.

Provisional membership is local to the planning pass; it is not a database booking. Persist batch progress for retry recovery. If an entire group fails downstream planning, leave its slots unfilled and defer reconsideration to a bounded later pass rather than repeatedly selecting the same failed group in a loop.

## 6. Similarity selection within a bucket

Use profile embeddings to form similar groups of 2–10 people. Standard unconstrained clustering alone does not establish the group-size contract. For a demo-friendly first implementation, use a deterministic greedy grouping procedure:

- Pick an unassigned seed user in stable order.
- Rank remaining people by a combination of profile similarity and the same friend-pair recency bonus, updating ranks as each member is added to the group (formula below).
- Fill a group toward an application-level target of four people.
- Adjust the final groups so no singleton is created; for five remaining people, create one group of five rather than four plus one.
- Continue until the bucket is partitioned into valid groups. Every member appears in exactly one final group.

Four is an implementation default, not a user preference. The required bounds are 2–10. If embeddings are unavailable, use shared onboarding interests with stable tie-breaking rather than failing the whole batch.

Reconnection must also influence final grouping: sharing a time bucket alone does not mean two friends attend the same event. For the initial greedy implementation, score each candidate against the current group:

```text
similarity(a, b) = clamp((cosine_similarity(a, b) + 1) / 2, 0, 1)
member_score(candidate, group) =
    mean(similarity(candidate, member) for member in group)
    + 0.5 * mean(pair_bonus(candidate, member) for member in group)
```

Use normalized shared-interest overlap in [0, 1] when embeddings are unavailable (zero if neither profile supplies interests). The 0.5 coefficient is an initial tunable implementation default. Use the same pair bonuses/history snapshot as bucket selection, stable user IDs for ties, and recompute scores after each addition. The averaging bounds friendship influence as the group grows. Prefer remainder adjustments that retain higher-scoring pairings while respecting 2–10 members and avoiding singletons. Do not merge whole friendship chains or force every overdue pair together; this is a soft preference, not a reconnection guarantee.

After grouping, recompute each group's common window from its source availability segments. It can be wider than the parent bucket because the participant who constrained that bucket may be in another group. Preserve the target-date and 48-hour restrictions.

## 7. Activity pipeline

Input: a provisional group, its full shared window, and relevant preference memories.

Convene chooses the activity; users do not select or exclude activities, set budgets, choose tools, or set group-size preferences. For the MVP, use a small application-owned catalog of in-person activities that can support a one-hour hangout. Minimum bucket duration is 60 minutes; the final event must fit the actual shared window. Default event duration is 60 minutes.

Have the LLM rank a few catalog activity IDs using the group's interests and memories. Return structured data containing activity IDs, duration, and a short explanation. Validate IDs and duration server-side; keep a deterministic catalog fallback. Do not pass phone numbers, exact home locations, or unrelated private memories to the model. User-facing explanations must not expose another person's raw answers or private feedback.

Keep alternate activities for location-search failure. No budget, platform, online-mode, or user-selected activity filters are applied in this narrowed pipeline.

## 8. Location and final time

Input: provisional group, ranked activities, city, relevant locations, and shared availability.

Use Maps/Places to find a real venue for the selected activity within the city. Assume city-level reachability; do not calculate personal travel limits or require transportation/budget/group-size settings. Prefer a sensible location relative to participants when location data is available.

Choose an exact one-hour event interval inside the common window. Use available provider opening-hours information to avoid known closed venues. Missing hours must remain explicitly unverified; the LLM must not invent venue facts. A search result is not a reservation or capacity guarantee.

If no suitable result is found, try another ranked activity or another time within the shared window, with bounded attempts. If all attempts fail, leave the group unassigned. Seeded fictional venues may be used in an explicitly labeled demo fallback; they must not be presented as verified real places.

## 9. Durable processing and atomic assignment

Use a scheduled server-side batch plus a retry/recovery worker. A browser does not need to remain open. Saving availability persists authorization but must not trigger the legacy immediate pair-matching worker after the rework is enabled.

Persist a city/date batch key, processing status, lease, attempts, snapshot revision, and stable group planning IDs. Serialize main and catch-up passes for a city/date or enforce equivalent claim protections. Persist a finalized group proposal before external notification so a retry can recover it.

Maps and LLM calls happen outside database locks. The final transaction:

- Locks all participant and source-slot records in a stable order.
- Verifies pending status, ownership, source revisions, and relevant profile/city snapshots.
- Rechecks the exact event fits every source slot and the local event date.
- Rechecks event start is at least 48 hours after the current booking time.
- Enforces 2–10 distinct participants, one event per slot, one assigned event per user/planning date, and no overlapping participant reservations.
- Inserts the event, participants, and reservations; fills all participating slots.
- Records a deduplicated notification job in the same transaction.

A unique stable group planning ID makes retries idempotent, while participant/date uniqueness and reservation constraints prevent competing proposals from booking the same people. A unique batch key alone is insufficient. All participant assignments succeed or the transaction rolls back.

Retain pending/filled/paused/expired/cancelled lifecycle states. Cancellation releases reservations and closes participating slots; it must not immediately rematch people. Explicit reopening may make slots eligible again only if notice and date-assignment rules permit it. Completed events continue to count toward the daily assignment limit.

Existing range and owner indexes remain useful. Add indexes for city/date eligibility, batch claims, and participant/date assignments as the schema evolves. Group scheduling requires changing the current pair-only transaction contract; existing migrations do not already implement this design.

## 10. Contact privacy and notifications

Collect a normalized international phone number and share it only with participants in an assigned event. There is no communication-platform picker. Keep phone numbers out of public profiles, embeddings, and LLM prompts. Cancelled events stop returning participant contacts. Phone ownership verification is outside the demo scope.

Notification delivery runs after commit and must be deduplicated by event/recipient/type. Phone coordination does not imply automated SMS. Mobile PWA push requires permission, stored per-device push subscriptions, and a backend sender; that feature remains unimplemented. In-app status remains available independently of push permission. Do not describe an event as delivered to a device merely because it was committed.

## 11. Server and data boundaries

Retain Next.js, React, TypeScript, Tailwind, Supabase Auth/Postgres, pgvector, and OpenAI. Use Maps/Places for the new location pipeline. Supabase is the source of truth for profiles, slots, batches, events, participants, reservations, and feedback. Profile embeddings and memories support selection and activity reasoning.

All mutations go through authenticated and validated server routes. Use owner/participant access controls and RLS. Service-role credentials and provider keys remain server-only. LLM output is a validated proposal, never a direct database write. Retain existing private feedback storage. Explicit friendship records and completed shared-event history support the reconnection bonus; advanced memory patching, social-graph optimization, and friendship invitation/acceptance UI remain deferred.

No schema migration or runtime change is made by this document. Legacy data and restrictions require an explicit migration plan before switching the running application to the narrowed contract; this document does not authorize silently clearing stored user data.

## 12. Acceptance checks

- Saving availability waits for the batch rather than immediately creating a plan.
- Monday's city-local batch targets Wednesday; final booking always enforces 48 elapsed hours, including retries and daylight-saving transitions.
- Non-round starts such as 11:10 produce valid candidates; there is no fixed hourly grid.
- Exactly 60 minutes qualifies; 59 minutes and boundary-only contact do not.
- Candidates and selected buckets count distinct people; counts are recomputed after each selection.
- Tie-breaking is stable and uses recomputed shared windows.
- Reconnection bonus is zero through day 14, 0.5 at day 37, and capped at 1 from day 60; bucket totals never exceed 50% of the people count.
- Count unordered friend pairs once; non-friends and directional saved-friend entries alone earn no bonus. Recompute pairs and the bucket cap after participant removal.
- Recency uses completed non-cancelled events, including group events; scheduled/cancelled events do not reset it. Verify creation-time fallback, missing timestamps, and retry snapshot stability.
- Group formation uses both similarity and reconnection scores without exceeding group limits, duplicating participants, or forcing friendship chains together.
- Duplicate/multiple slots do not duplicate users; cross-midnight slots cannot be filled twice.
- Group sizes stay within 2–10 without singleton leftovers; narrower groups recover their full common windows.
- Removed controls are absent from the new UI and request contract, not merely ignored visually.
- Maps/LLM failures leave recoverable unfilled slots; invalid activity or venue IDs are rejected.
- Concurrent workers, stale edits, and crash retries cannot create duplicate or conflicting events.
- Every group assignment is atomic and notification retries are deduplicated.
- Participant phone numbers remain private outside assigned-plan access.

## Appendix: Preference memory design (retained roadmap)

The following existing memory-model design is retained for reference. Basic onboarding extraction and profile embeddings support the MVP; granular retrieval, patches, notification questions, and adaptive learning remain future work. This appendix does not reintroduce user activity filters or other removed planning choices.



The preference model is responsible for representing what Convene knows about a user without reducing them to shallow tags.

The system should support both fast retrieval and nuanced reasoning:

- Fast retrieval asks: "Who might be worth considering?"
- Nuanced reasoning asks: "Does this specific person, activity, and setting actually fit?"

To support both, Convene separates broad indexes from detailed preference memories.

### Design Goals

- Preserve nuance from user language.
- Avoid treating broad categories as complete identities.
- Allow preferences to change over time.
- Store evidence for why the system believes something.
- Support both explicit onboarding answers and feedback-based learning.
- Keep deterministic constraints separate from fuzzy preferences.

### Preference Memory Structure

A preference memory represents one specific learned claim about a user.

Example:

```json
{
  "id": "prefmem_101",
  "user_id": "user_001",
  "topic": "video games",
  "summary": "Enjoys games as a low-pressure way to collaborate and talk.",
  "evidence": [
    "mentioned Valorant",
    "likes co-op Minecraft",
    "enjoys story-driven RPGs",
    "dislikes high-pressure ranked matches"
  ],
  "attributes": {
    "preferred_modes": ["co-op", "casual competitive"],
    "intensity": "low-to-medium",
    "voice_chat": "optional"
  },
  "memory_embedding": "[vector stored separately]",
  "confidence": 0.72,
  "source": "onboarding_llm_followup",
  "created_at": "2026-09-23T18:45:00Z",
  "last_updated": "2026-09-23T18:45:00Z"
}
```

### Flexible Attributes

The `attributes` object is intentionally flexible. Different preference topics need different dimensions.

Food:

```json
{
  "cuisines": ["Thai", "Korean", "Mexican"],
  "dietary_constraints": ["vegetarian"],
  "spice_tolerance": "medium",
  "price_range": "$$"
}
```

Games:

```json
{
  "preferred_modes": ["co-op", "casual competitive"],
  "platforms": ["PC", "Switch"],
  "intensity": "low-to-medium",
  "voice_chat": "optional"
}
```

Outdoor activities:

```json
{
  "difficulty": "easy-to-moderate",
  "distance": "under 5 miles",
  "pace": "social",
  "weather_sensitivity": "avoids extreme heat"
}
```

### Evidence and Confidence

Confidence should be attached to specific memories, not the whole profile.

A memory based on one vague onboarding answer should have lower confidence than a memory supported by repeated behavior and feedback.

Possible confidence inputs:

- Explicit user statement
- Repeated user behavior
- Post-hangout feedback
- Recency
- Contradictory evidence
- User correction

### Memory Retrieval

Preference memories should be retrieved directly when the system needs fine-grained context.

`profile_embedding` is useful for broad user-to-user similarity, but it is too coarse for questions like "Which memories are relevant to this rock climbing answer?" or "Why is this activity a good fit?" For those tasks, Convene should search across `memory_embedding` values.

Retrieval layers:

- `interest_index`: cheap broad filter for obvious topics.
- `profile_embedding`: broad user-to-user similarity.
- `memory_embedding`: granular retrieval of specific preference memories.
- `Preference Memory`: source-of-truth nuanced record.

#### Retrieval Inputs

Memory retrieval should accept a small structured request:

```json
{
  "user_id": "user_001",
  "query_text": "I'd try rock climbing, but only with friends and nothing too intense.",
  "query_context": "notification_question",
  "candidate_topics": ["rock climbing", "outdoor activities", "exercise", "adventurous activities"],
  "max_results": 5
}
```

Fields:

- `user_id`: the user whose memories should be searched.
- `query_text`: the new user signal, activity, match explanation request, or planning question.
- `query_context`: where the query came from, such as `onboarding`, `notification_question`, `post_hangout_feedback`, `matching`, or `activity_planning`.
- `candidate_topics`: optional topic hints from the UI, notification template, or upstream classifier.
- `max_results`: default to `5` for memory updates.

#### Retrieval Algorithm

For memory updates, use this default retrieval flow:

1. Build a retrieval query from the new signal.

```text
query_text + candidate_topics + query_context
```

2. Generate an embedding for the retrieval query.
3. Search the user's active preference memories by cosine similarity against `memory_embedding`.
4. Fetch the top `5` memories by embedding similarity.
5. Also fetch exact or fuzzy topic matches from `topic` and `interest_index`, if any exist.
6. Merge the embedding results and topic results.
7. Deduplicate by `memory_id`.
8. Rerank using a weighted score.
9. Pass only the final top `5` memories into the LLM update call.

Suggested rerank score:

```text
score =
  (0.70 * embedding_similarity) +
  (0.15 * topic_match_score) +
  (0.10 * recency_score) +
  (0.05 * confidence_score)
```

Scoring notes:

- `embedding_similarity` should be normalized to `0.0-1.0`.
- `topic_match_score` should be `1.0` for exact topic match, `0.5` for related topic match, and `0.0` otherwise.
- `recency_score` should be higher for recently created or recently reinforced memories.
- `confidence_score` should be the memory's current confidence value.

Default thresholds:

- If a memory has `embedding_similarity < 0.35` and no topic match, exclude it.
- If fewer than `3` memories pass the threshold, allow the best lower-scoring memories until either `3` memories are included or no memories remain.
- If no memories are found, call the LLM with an empty relevant-memory list and allow only `create_memory` or `no_op`.

The default `max_results` should be `5`. This keeps the LLM context focused and reduces the chance that unrelated memories drift.

#### Retrieval Output

The retrieval step should return compact memory records, not the entire user profile.

Example output:

```json
{
  "query": "I'd try rock climbing, but only with friends and nothing too intense.",
  "memories": [
    {
      "id": "prefmem_204",
      "topic": "outdoor activities",
      "summary": "Open to outdoor activities when they are beginner-friendly and social.",
      "evidence": [
        "said hiking sounded fun if the trail was easy",
        "preferred social pace over intense exercise"
      ],
      "attributes": {
        "difficulty": "easy",
        "pace": "social"
      },
      "confidence": 0.66,
      "retrieval_score": 0.82
    }
  ]
}
```

Only include fields needed for reasoning:

- `id`
- `topic`
- `summary`
- `evidence`
- `attributes`
- `confidence`
- `last_updated`
- `retrieval_score`

Do not pass unrelated memories, full raw onboarding transcripts, private calendar details, or the full profile unless the specific operation requires them.

#### Example

```text
New answer:
"I'd try rock climbing, but only with friends and nothing too intense."

Relevant memories to retrieve:
- Outdoor activities
- Exercise or fitness comfort
- Novelty/adventurousness
- Group comfort
- Intensity tolerance
```

The system should retrieve only relevant memories before asking the LLM to reason about an update. It should not pass the user's entire memory history into every update call.

### Memory Update Flow

When a user provides a new signal, such as answering a notification question or giving feedback after a hangout, Convene should update memories through a controlled patch flow.

```text
New user signal
 -> retrieve relevant memories
 -> LLM proposes memory operation
 -> backend validates operation
 -> apply memory changes
 -> refresh derived profile fields and embeddings
```

The LLM should propose memory operations rather than directly rewriting the user's profile.

A single user signal may affect multiple memories. For example, "I'd try rock climbing, but only with friends and nothing too intense" could create a rock climbing memory, update an outdoor activities memory, and update a social comfort memory. For that reason, the LLM should return a memory patch containing a list of operations, not a single operation.

Possible operations:

- `create_memory`
- `update_memory`
- `merge_memories`
- `weaken_memory`
- `archive_memory`
- `no_op`

#### Memory Operation Contract

Each memory update should be returned as structured JSON. The LLM chooses proposed operations, but backend code validates and applies them.

Top-level patch shape:

```json
{
  "patch_id": "patch_701",
  "user_id": "user_001",
  "source": "notification_question",
  "input_summary": "User said they would try rock climbing if invited by friends, but only in a low-intensity setting.",
  "operations": [],
  "requires_user_confirmation": false
}
```

Patch fields:

- `patch_id`: optional client-generated or server-generated ID for tracing.
- `user_id`: user whose memories may be changed.
- `source`: where the new signal came from.
- `input_summary`: concise summary of the new user signal.
- `operations`: ordered list of memory operations.
- `requires_user_confirmation`: whether the proposed patch should be shown to the user before applying.

The `operations` list may contain zero, one, or many operations. If there is nothing worth changing, the list should contain a single `no_op`.

Every operation should include:

- `operation`: operation name.
- `reason`: short explanation of why this operation is appropriate.
- `source`: where the new signal came from, such as `onboarding`, `notification_question`, or `post_hangout_feedback`.

Operation ordering matters. The backend should apply operations in order after validation. If any operation references the result of a previous operation, it should use a temporary client-side reference such as `temp_memory_1`.

Example multi-operation patch:

```json
{
  "patch_id": "patch_701",
  "user_id": "user_001",
  "source": "notification_question",
  "input_summary": "User said they would try rock climbing if invited by friends, but only in a low-intensity setting.",
  "requires_user_confirmation": false,
  "operations": [
    {
      "operation": "create_memory",
      "temp_id": "temp_memory_1",
      "reason": "Rock climbing is a new specific activity preference not covered by existing memories.",
      "source": "notification_question",
      "memory": {
        "topic": "rock climbing",
        "summary": "Open to trying rock climbing if invited by friends, but prefers beginner-friendly low-intensity settings.",
        "evidence": [
          "answered yes to trying rock climbing if invited, with a low-intensity constraint"
        ],
        "attributes": {
          "experience_level": "beginner",
          "intensity": "low",
          "social_context": "with friends"
        },
        "confidence": 0.62,
        "source": "notification_question"
      }
    },
    {
      "operation": "update_memory",
      "reason": "The answer reinforces an existing broader preference for beginner-friendly outdoor activities.",
      "source": "notification_question",
      "memory_id": "prefmem_204",
      "changes": {
        "append_evidence": [
          "said she would try rock climbing if invited by friends, but nothing too intense"
        ],
        "set_attributes": {
          "difficulty": "beginner-friendly",
          "intensity": "low"
        },
        "confidence_delta": 0.04
      }
    }
  ]
}
```

Backend patch behavior:

- Validate every operation before applying any operation.
- Reject the whole patch if any operation is invalid, unless partial application is explicitly enabled.
- Apply operations in the listed order.
- Resolve temporary IDs to real memory IDs after creation.
- Regenerate embeddings only for created, updated, merged, weakened, or archived memories.
- Refresh derived profile fields once after the full patch is applied, not after each individual operation.
- Store the patch and validation result for debugging/audit.

##### `create_memory`

Creates a new preference memory when the new signal represents a meaningful preference that is not already covered by an existing memory.

Use when:

- No retrieved memory covers the new topic.
- The signal is specific enough to be useful later.
- The signal is not merely a one-off reaction with no planning value.

Required fields:

- `topic`
- `summary`
- `evidence`
- `attributes`
- `confidence`
- `source`

Backend behavior:

- Create a new memory record.
- Generate `memory_embedding` from topic, summary, evidence, and attributes.
- Add or update relevant values in `interest_index`.
- Refresh `profile_embedding` and profile summary if needed.

##### `update_memory`

Updates an existing memory when the new signal adds evidence, refines attributes, or slightly changes confidence.

Use when:

- A retrieved memory already represents the same preference area.
- The new signal strengthens, weakens, or clarifies that memory.
- The update does not require combining two separate memories.

Allowed changes:

- `append_evidence`
- `set_attributes`
- `remove_attributes`
- `confidence_delta`
- `replace_summary`

Backend behavior:

- Validate the referenced `memory_id`.
- Append new evidence rather than deleting old evidence.
- Apply attribute updates.
- Clamp confidence between `0.0` and `1.0`.
- Regenerate the memory's `memory_embedding`.
- Refresh derived profile fields if the update changes the memory meaningfully.

##### `merge_memories`

Combines two or more existing memories when they are redundant or should become one consolidated memory.

Use when:

- Two memories describe the same underlying preference.
- A newer memory duplicates an older one with slightly different wording.
- Separate memories are causing fragmented or contradictory retrieval.

Required fields:

- `memory_ids`
- `merged_memory`
- `reason`

Backend behavior:

- Create or update a canonical memory with the merged summary, evidence, attributes, and confidence.
- Preserve evidence from all merged memories unless it is clearly duplicated.
- Mark non-canonical memories as archived or merged, rather than deleting them.
- Regenerate the canonical `memory_embedding`.
- Refresh derived profile fields.

##### `weaken_memory`

Reduces confidence in an existing memory without removing it.

Use when:

- New evidence partially contradicts an existing memory.
- A user gives feedback that suggests the preference is weaker than expected.
- A memory is old and no longer reinforced.

Required fields:

- `memory_id`
- `confidence_delta`
- `evidence`
- `reason`

Backend behavior:

- Validate that `confidence_delta` is negative.
- Append the contradicting or weakening evidence.
- Clamp confidence between `0.0` and `1.0`.
- If confidence drops below a minimum active threshold, mark the memory as inactive or archived.
- Regenerate `memory_embedding` if the summary or evidence changes meaningfully.

##### `archive_memory`

Marks a memory as inactive when it should no longer influence matching or planning.

Use when:

- The user explicitly corrects the system.
- The memory is clearly wrong.
- The memory has been superseded by a more accurate memory.
- The memory is stale and low confidence.

Required fields:

- `memory_id`
- `reason`
- `replacement_memory_id`, if applicable

Backend behavior:

- Set the memory status to `archived`.
- Keep the memory for audit/history rather than deleting it.
- Exclude archived memories from default retrieval and matching.
- Refresh derived profile fields.

##### `no_op`

Does not change memory state.

Use when:

- The signal is too vague.
- The signal is unrelated to social planning.
- Retrieved memories already cover the new signal well enough.
- The LLM is uncertain and should avoid creating noisy memories.

Required fields:

- `reason`

Backend behavior:

- Store the raw interaction only if needed for product analytics or conversation continuity.
- Do not change preference memories.
- Do not refresh embeddings unless another part of the interaction requires it.

Example create operation:

```json
{
  "operation": "create_memory",
  "reason": "The user expressed a new specific preference about rock climbing that is not covered by the retrieved memories.",
  "source": "notification_question",
  "memory": {
    "topic": "rock climbing",
    "summary": "Open to trying rock climbing if invited by friends, but prefers beginner-friendly low-intensity settings.",
    "evidence": [
      "answered yes to trying rock climbing if invited, with a low-intensity constraint"
    ],
    "attributes": {
      "experience_level": "beginner",
      "intensity": "low",
      "social_context": "with friends"
    },
    "confidence": 0.62,
    "source": "notification_question"
  }
}
```

Example update operation:

```json
{
  "operation": "update_memory",
  "reason": "The existing outdoor activities memory already covers beginner-friendly activities, and the new rock climbing answer refines intensity and social context.",
  "source": "notification_question",
  "memory_id": "prefmem_204",
  "changes": {
    "append_evidence": [
      "said she would try rock climbing if invited by friends, but nothing too intense"
    ],
    "set_attributes": {
      "intensity": "low",
      "social_context": "with friends"
    },
    "confidence_delta": 0.08
  }
}
```

The backend should validate proposed operations before applying them:

- Confirm referenced memory IDs exist.
- Enforce allowed fields and operation types.
- Bound confidence changes.
- Preserve existing evidence unless explicitly merged or archived.
- Reject updates based on weak or unrelated signals.
- Require user confirmation for sensitive or high-impact assumptions.

After updates are applied, the system should regenerate affected `memory_embedding` values and refresh derived profile fields such as `interest_index`, `profile_embedding`, and `summary`.

### Memory Updates

Preference memories should be updated gradually rather than overwritten aggressively.

Examples:

- If a user enjoys one board game cafe hangout, do not conclude they love all board games.
- If a user dislikes one noisy restaurant, do not conclude they dislike restaurants.
- If a user repeatedly accepts quiet coffee hangouts, strengthen the quiet/low-pressure social setting memory.

### Derived Profile Fields

The preference profile can contain derived fields for performance and retrieval:

- `summary`
- `interest_index`
- `profile_embedding`
- `preference_memory_ids`

These fields are generated from memories and should be recalculated when memories change.

### Matching Usage

Preference memories should be used in different phases:

- Candidate retrieval: use `interest_index` and `profile_embedding`.
- Compatibility scoring: compare relevant preference memories.
- Activity planning: inspect activity-specific attributes and constraints.
- Explanation: cite the memories that influenced the recommendation.
- Feedback update: strengthen, weaken, or add memories based on the result.

### Anti-Pigeonholing Rules

Convene should follow a few rules to avoid overgeneralizing:

- Never treat a broad category as the full preference.
- Prefer examples and evidence over labels.
- Track dislikes and exceptions.
- Treat old memories as weaker unless reinforced.
- Let users inspect and correct profile assumptions.
- Distinguish "likes this activity" from "likes this activity with strangers."
