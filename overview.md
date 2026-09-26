# Convene — Product Overview

> You give Convene time. Convene turns it into plans.

Convene removes the coordination work of meeting people: comparing schedules, choosing company, deciding what to do, and finding a place.

## Revised hackathon MVP

This is the agreed target as of September 26, 2026. The pipeline rework is not implemented yet. README.md documents the current running application, IMPLEMENTATION.md tracks the transition, and technical-design.md specifies the new algorithm.

Users create an account and complete onboarding with name, age, city/location, private phone number, interests, questions, and short written answers. Keep the original memory-generation process unchanged to create the initial memory sketch. Users then submit dated availability. For scheduling, availability is the only choice they make. Convene chooses the other people, activity, venue, and exact time.

Hangouts are in-person only. Phone numbers provide participant coordination. The MVP assumes people can reach venues within their city.

Remove activity selections/exclusions, budgets, preferred group sizes, tool/platform choices, meeting-mode choices, travel-radius controls, and connection-category choices from the target flow. Online planning, blocking, and separate friendship invitations are outside this hackathon scope; mutual per-person feedback is included. Profile interests remain useful for learning who people are.

## Planning flow

1. Saving availability queues the user for a daily planning batch.
2. At midnight in each city's time zone, plan for the local date two days ahead. Every final assignment must still provide at least 48 elapsed hours of notice.
3. Find candidate groups sharing at least one hour. Use actual availability start boundaries rather than fixed hourly slots.
4. Select the highest-scoring time bucket using people count plus a capped bonus for friends who have not met recently, remove its people from other candidates, and repeat. Every selected bucket has at least two distinct people and retains its full shared window.
5. Split each bucket into groups of 2–10 using profile similarity and reconnection priority so overdue friends are more likely to share the final event. Group size is chosen by the application.
6. Use relevant preference memories to rank in-person activities suitable for a one-hour event.
7. Find a venue in the city with Maps/Places and select an exact time inside shared availability.
8. Save the group event atomically and notify participants after assignment. PWA push requires separate implementation.

For example, availability beginning at 11:10 is valid; there is no requirement to start on the hour. One hour is the minimum overlap and default event duration, not a start-time grid.

The MVP assigns at most one hangout per person per planning date and one per availability slot. Candidate buckets can overlap during evaluation, but selected buckets do not share people. People without a viable bucket remain unmatched.

Count-based selection with a reconnection bonus is a deliberate simplification: it favors larger pools and overdue friendships but may match fewer people than another arrangement. It does not optimize the smallest bucket globally. Without friendship bonuses it reduces to largest-first.

The initial reconnection bonus is zero for the first 14 days since a friend's last completed shared hangout, then grows linearly to +1 per unique friend pair at 60 days. The total bucket bonus is capped at half the participant count. Friendship and bonus eligibility begin only after both people explicitly answer yes about meeting each other again for the same completed hangout. Missing feedback counts as no. Scheduled and cancelled plans do not count as meetings. Reconnection also influences final grouping, but is a preference rather than a guarantee; all availability and group-size rules still hold.

## User experience

Show when a slot is waiting for its batch, when a plan is assigned, and when no plan was found. Users can edit or pause unassigned slots. Late additions are considered only if a complete event can still meet the 48-hour notice rule. Existing plans stay stable.

Assigned-plan details show the people, activity, venue, time, and private participant phone contacts. Cancellation closes slots rather than immediately creating replacement plans.

After a group hangout, ask Would you want to meet this person again? for each other participant individually. Both must answer yes to become friends automatically; users do not manually add friends. Late answers can establish mutual interest later. Missing feedback prevents creating a friendship but does not erase one already established.

The personal friend graph shows people the user has connected with and distinguishes mutual friendships. Lines fade with time since the last completed shared Convene hangout and brighten after meeting again, while old connections stay visible. Fading does not remove friendship; overdue friends can gain reconnection priority. Do not display others' private feedback or relationships between other users.

The profile displays generated memories rather than making raw answers the main view. Users can Edit or Delete their own memories. No Use less or separate influence attribute is included. Update affected embeddings/derived profile data so corrections are reflected in future planning and deleted memories stop influencing it. Memory generation itself stays the same as the original spec.

## Implementation boundaries

Use AI for preference interpretation and activity ranking. Use backend code for availability, notice, group-size validation, deduplication, privacy, and booking. Maps provides venue facts; do not invent venues or imply reservations.

The stack remains Next.js, React, TypeScript, Tailwind, Supabase, pgvector, and OpenAI, with Maps/Places added for the new location flow. Retain the mobile-first PWA approach. Native app distribution is not required.

Calendar integration, configurable planning preferences, online experiences, advanced relationship management and friendship invitation UI, advanced memory learning, and production-scale optimization can be revisited after the demo. Basic friendship-based reconnection priority is part of the target MVP.
