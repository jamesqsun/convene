# Convene Technical Requirements

This document lists the infrastructure, databases, APIs, credentials, and external services needed to implement Convene.

## 0. Application Stack

Convene should be built as a mobile-first web app with PWA support. This allows one codebase to work on desktop and mobile while still feeling like a phone app when installed to the home screen.

Recommended stack:

- Next.js
- React
- TypeScript
- Tailwind CSS
- Supabase Postgres
- Supabase Auth
- pgvector
- OpenAI API
- Vercel
- Google Places/Maps API if live venue search is implemented

Why web app + PWA:

- Fastest path for a hackathon MVP.
- One codebase for desktop and mobile.
- Can be installed on a phone home screen.
- Avoids App Store / Play Store setup.
- Works well with server-side API calls for LLMs, database access, and Maps APIs.

PWA requirements:

- Responsive mobile-first UI.
- `manifest.json`.
- App icons.
- Theme color.
- Service worker.
- Installable home-screen experience.

Native mobile development, such as React Native or Swift/Kotlin, should be avoided for the MVP unless native-only capabilities become necessary.

## 1. Required Core Services

### Application Database

Purpose:

- Store users, preference profiles, preference memories, availability blocks, connections, activities, matching requests, hangouts, and feedback.

Recommended options:

- PostgreSQL
- Supabase Postgres
- Neon Postgres

Why needed:

- Convene has relational data with clear references between users, hangouts, feedback, connections, and memories.
- Postgres supports structured relational data, flexible `jsonb` fields, and vector search through `pgvector`.
- Most flexible fields, such as preference memory `attributes`, activity preference `attributes`, provider venue payloads, and LLM metadata, can be stored as `jsonb`.
- Core entities should still use relational tables and foreign keys so matching, scheduling, feedback, and social graph queries stay reliable.

Why not a document-only database:

- Convene has many relationships between users, connections, hangouts, feedback, and memories.
- Scheduling and matching need joins, constraints, filtering, and transactional updates.
- JSON-heavy does not mean schemaless. The system still needs durable relationships and validation.

Recommended data modeling approach:

- Use relational columns for stable identity, ownership, status, timestamps, and foreign keys.
- Use `jsonb` for flexible domain-specific attributes.
- Use `pgvector` for `profile_embedding` and `memory_embedding`.
- Add indexes on commonly queried `jsonb` fields only when query patterns are known.

Required data:

- `users`
- `preference_profiles`
- `preference_memories`
- `availability_blocks`
- `connections`
- `activities`
- `activity_preferences`
- `matching_requests`
- `hangouts`
- `feedback`

### Vector Search

Purpose:

- Store and query `profile_embedding` and `memory_embedding`.
- Retrieve relevant preference memories for updates, matching, planning, and explanations.

Recommended options:

- PostgreSQL with `pgvector`
- Supabase Vector
- Pinecone
- Weaviate

Recommended for MVP:

- Use `pgvector` if using Postgres.

Why needed:

- `profile_embedding` supports broad user-to-user retrieval.
- `memory_embedding` supports fine-grained retrieval of relevant preference memories.

### LLM API

Purpose:

- Convert onboarding answers into preference memories.
- Propose memory patches.
- Normalize activity filters.
- Generate explanations.
- Rerank valid activity or venue candidates using soft social context.
- Interpret feedback.

Required credentials:

- OpenAI API key or equivalent LLM provider key.

Expected LLM calls:

- Profile Agent
- Memory Patch Agent
- Matching Explanation Agent
- Activity Planning Agent
- Location Rerank / Explanation Agent
- Feedback Agent

Important constraints:

- LLM outputs must be structured JSON.
- Backend validates all outputs before applying changes.
- LLM should not be the source of truth for availability, maps, venue facts, or database writes.

### Embeddings API

Purpose:

- Generate `profile_embedding`.
- Generate `memory_embedding`.
- Generate retrieval query embeddings.

Required credentials:

- OpenAI API key or equivalent embeddings provider key.

Why needed:

- Supports semantic similarity beyond exact tags.
- Enables memory retrieval for nuanced updates.

## 2. Recommended Demo Services

### Places / Maps API

Purpose:

- Search real venues.
- Fetch venue metadata.
- Validate addresses, coordinates, categories, ratings, hours, and open status.
- Calculate travel distance or travel time.

Recommended options:

- Google Places API
- Google Distance Matrix API
- Google Directions API
- Yelp Fusion API
- Foursquare Places API
- Mapbox APIs

Required credentials:

- API key for chosen maps/places provider.

Used by:

- Location Planning System
- Venue Candidate Provider
- Venue Enrichment Service
- Travel fairness scoring

Notes:

- Production should use live provider data.
- Seeded venue catalog is only for demo, tests, and fallback.
- Cached venue results should expire and be refreshed before final scheduling.

### Calendar API

Purpose:

- Read user availability from real calendars.
- Detect conflicts.
- Create scheduled hangout events.

Recommended options:

- Google Calendar API
- Microsoft Outlook Calendar API

Required credentials:

- OAuth client ID
- OAuth client secret
- Redirect URI
- User-granted calendar scopes

MVP status:

- Optional.
- Manual availability blocks are enough for the first working version.

Future use:

- Read free/busy data.
- Write confirmed hangouts to calendars.
- Update or cancel events.

## 3. Optional Future Services

### Notifications

Purpose:

- Ask low-friction preference questions.
- Remind users about upcoming hangouts.
- Request post-hangout feedback.
- Suggest reconnections.

Options:

- Email provider
- Push notifications
- SMS provider
- In-app notifications

Possible providers:

- SendGrid
- Resend
- Firebase Cloud Messaging
- Twilio

Required credentials:

- Provider API key.

### Authentication

Purpose:

- Manage user accounts and sessions.
- Connect calendar or provider accounts.

Options:

- Supabase Auth
- Auth0
- Clerk
- Firebase Auth
- Custom auth

MVP status:

- Can be simple if the demo uses seeded users.

### Online Platform Integrations

Purpose:

- Support online hangouts through platforms like Discord, games, or watch-party tools.

Possible integrations:

- Discord OAuth/API
- Steam API
- Riot Games API
- YouTube or streaming/watch-party tools

MVP status:

- Optional.
- Can store user-provided platform handles instead.

## 4. Environment Variables

Example environment variables:

```text
DATABASE_URL=
OPENAI_API_KEY=
EMBEDDINGS_MODEL=
LLM_MODEL=
GOOGLE_MAPS_API_KEY=
GOOGLE_CALENDAR_CLIENT_ID=
GOOGLE_CALENDAR_CLIENT_SECRET=
GOOGLE_CALENDAR_REDIRECT_URI=
YELP_API_KEY=
FOURSQUARE_API_KEY=
MAPBOX_API_KEY=
AUTH_SECRET=
```

Only configure provider keys that are actually used by the implementation.

## 5. MVP Requirement Set

Minimum technical requirements:

- Application database
- Vector search
- LLM API
- Embeddings API
- Seeded users
- Seeded activities
- Seeded venue catalog
- Manual availability input

Nice-to-have demo requirements:

- Places/Maps API
- Travel-time API
- Calendar read/write API
- Notifications

## 6. Provider Responsibility Summary

```text
Postgres -> source of truth for app data
pgvector/vector DB -> semantic retrieval
LLM API -> fuzzy reasoning and structured proposals
Embeddings API -> vector representations for retrieval
Maps/Places API -> venue facts and travel data
Calendar API -> real availability and event creation
Notifications -> reminders, feedback prompts, preference questions
Auth provider -> accounts, sessions, OAuth connections
```

## 7. Security Notes

- Never expose API keys to the frontend.
- Store OAuth tokens encrypted or in a secure provider-managed store.
- Request the minimum calendar scopes needed.
- Do not pass unnecessary private user data into LLM prompts.
- Do not include private details about one user in explanations shown to another user.
- Validate every LLM output before writing to the database.
