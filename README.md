# Convene - HackGT 2026

Arav Chadha, Mason Lam, James Sun

Convene is a mobile-first web app that turns free time into in-person plans. People say when they are free, and Convene chooses the rest: who they meet, what they do, where, and exactly when. It plans small group hangouts at least 48 hours ahead, then learns from how each one went.

## What It Does

- Plans hangouts from availability alone. There are no activity pickers, budgets, or group-size settings.
- Builds a private set of preference memories from a few written onboarding answers, each backed by a quote from what the person wrote.
- Groups people who are free at the same time into hangouts of two to five, favoring similar interests and friends who are overdue to meet again.
- Picks an activity from its own catalog and a real venue from Google Places, with an exact time inside everyone's shared window.
- Reads busy time from Google Calendar and writes matched hangouts into a dedicated Convene calendar.
- Sends push notifications for new plans, changes, feedback reminders, and interest check-ins.
- Asks each person afterwards whether they would meet each other person again. A mutual yes becomes a friendship.
- Shows a friend graph of everyone a person has connected with, faded by how long ago they last met.
- Learns over time from private hangout feedback and yes/no interest check-ins, including check-ins about real upcoming events in the person's city.

## Project Structure

- `src/app/`
  - Next.js pages and API routes, each a one-line wrapper around a feature
- `src/features/`
  - one folder per feature: `auth`, `profile`, `memories`, `availability`, `calendar`, `planning`, `events`, `feedback`, `graph`, `interests`, `push`, `seed`
  - `planning/` holds the matching pipeline: time segments, overlap buckets, group partition, activity ranking, venue selection, and the batch driver
- `src/lib/`
  - database drivers, environment parsing, time zones, HTTP helpers, migrations
- `supabase/migrations/`
  - the SQL schema, applied to both the hosted database and the in-process one
- `scripts/`
  - migrate, seed, worker, and demo commands
- `mockups/`
  - static HTML mockups of the interface
- `overview.md`, `technical-requirements.md`, `technical-design.md`, `DECISIONS.md`
  - the product spec, the algorithm, and the record of judgment calls

## Core Flow

1. A person signs up with email or Google and completes onboarding: name, age, city, phone, interests, and three short written answers.
2. Convene turns the answers into preference memories and embeds them for similarity matching.
3. The person paints their free time on a weekly grid. Busy time from a connected calendar is removed.
4. Each night, per city, the planner finds groups of people who share at least an hour and selects the best ones.
5. For each group, the model ranks catalog activities against the group's memories, and Google Places supplies a venue.
6. The hangout is saved in one transaction and each participant gets a push notification. The plan in the app shows the activity, venue, time, and the group's phone numbers.
7. After the hangout, each person answers "meet again?" about each other person and can leave private feedback.
8. Mutual yes answers create friendships, and feedback adds new memories, so later plans get better.

## Tech Stack

- Next.js 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS
- PostgreSQL with pgvector
- Supabase (database and Auth)
- PGlite (in-process Postgres for demo mode and tests)
- Meta Muse Spark API
- OpenAI or Gemini embeddings
- Google Places API
- Google Calendar API
- Web Push
- Zod
- Vitest
- Vercel

## Local Setup

Requires Node.js 20.9 or newer and pnpm 10.34.5 (`npm install -g pnpm@10.34.5`).

1. Install dependencies:

```bash
pnpm install
```

2. Run in demo mode, which needs no keys:

```bash
pnpm dev
```

Open `http://localhost:3000` and tap a demo persona to sign in. Demo mode runs an in-process database seeded with twelve fictional people. It contacts no outside service and resets on restart.

3. To use real accounts and services, create a local config file:

```bash
cp .env.example .env.local
```

4. Set `CONVENE_MODE=supabase` in `.env.local` and add the keys you want to use:

- Supabase URL, publishable key, secret key, and `DATABASE_URL`
- `CRON_SECRET`
- `META_API_KEY`, plus `OPENAI_API_KEY` or `GEMINI_API_KEY` for embeddings
- `GOOGLE_PLACES_API_KEY`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `CALENDAR_TOKEN_SECRET`
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT`

Only the Supabase values and `CRON_SECRET` are required. Without the others, Convene uses a built-in stand-in for that service.

5. Apply the database schema:

```bash
pnpm migrate
```

6. Seed the demo cast of twenty-five people in Atlanta. This deletes every account and all data first:

```bash
pnpm seed:demo --yes
```

7. Start the app, and in a second terminal the scheduler:

```bash
pnpm dev
pnpm worker
```

## Development Notes

- `pnpm seed:demo` without `--yes` only reports what it would delete.
- `pnpm planning:run-all` plans every date now instead of waiting for the nightly batch.
- `pnpm events:complete-all` ends all scheduled hangouts so feedback can be given.
- `pnpm interests:send "topic"` sends an interest check-in to everyone with notifications on.
- `pnpm interests:discover` finds a real upcoming event in each city and sends it as a check-in.
- Add your own availability before running `pnpm planning:run-all`. One run uses up the seeded cast.
- On Node 20, prefix `pnpm seed` and `pnpm db:reset` with `NODE_OPTIONS=--experimental-websocket`.
- Use the Supabase pooler on port 6543 in `DATABASE_URL` if connections run out.
- Run `pnpm typecheck`, `pnpm test`, and `pnpm format` before committing.
- Read `DECISIONS.md` before changing planning, schema, or time-zone code.

## Current Backend Capabilities

- Sign-up, sign-in, and Google sign-in through Supabase Auth
- Profile and onboarding, with city search
- Memory generation, editing, and deletion
- Weekly availability, with pause and reopen
- Google Calendar connect, calendar selection, and sync
- Nightly planning batch with leases, retries, and crash recovery
- Plan detail and withdrawal
- Per-person and per-hangout feedback
- Friend graph
- Interest check-ins, broadcast by hand or discovered per city
- Push subscriptions and delivery with retries
- Scheduler endpoints protected by a shared secret

## Summary

Convene removes the coordination work of meeting people. Instead of comparing schedules, choosing company, deciding what to do, and finding a place, a person gives Convene their free time and gets back a plan. Each hangout teaches it more about who they enjoy and what they like doing.
