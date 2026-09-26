# Convene - Quick Design Doc

## Overview

Convene is a virtual "connector" friend that removes the friction from making and maintaining real social connections.

Instead of making users browse profiles, coordinate schedules, decide what to do, and manually plan everything, Convene learns what they enjoy, understands when they are available, and automatically schedules blind social hangouts with compatible new people or existing friends.

The core idea is simple:

> You give Convene time. Convene turns it into plans.

Convene can coordinate both in-person and online hangouts, with a focus on creating real human interaction rather than replacing it with AI.

## Problem

People often want to socialize more, meet new people, or reconnect with friends, but several points of friction get in the way:

- Finding compatible people
- Reaching out first
- Comparing schedules
- Choosing an activity
- Picking a location
- Coordinating a group
- Remembering to reconnect with people
- Decision fatigue from browsing profiles or events

Traditional social apps generally help users discover people, but still leave most of the work required to actually meet them to the user.

Convene handles the coordination layer.

## Core Product Loop

### Availability is the invitation

Saving an availability slot authorizes Convene to fill it automatically. There is no required “Make plan,” “Make magic happen,” or “Plan my week” action. The slot stays waiting until a compatible person has overlapping availability; neither person needs to be online or press a button at the same time.

For example, a user saves Sunday, 3–8 pm, optionally selecting coffee. Convene keeps that slot pending and, when a compatible nearby person is available, assigns a coffee event entirely within their shared window. The event occupies only its actual duration. Default to one event per slot; unused time does not authorize additional events unless the user opts in. If no match becomes available before the slot expires, show it as unfilled rather than forcing a poor match.

Activity, meeting mode, and connection preferences default to “Surprise me” / “Any compatible option.” Users may optionally narrow them. Random selection always stays within both people's explicit constraints, exclusions, budget, travel limits, and consent settings.

Use “select all that apply” for interests, activities, acceptable meeting modes, languages, platforms, acceptable group sizes, and connection categories. Selecting coffee and board games means either is acceptable, not that both must happen. Choose one final activity and mode from options acceptable to everyone. “Surprise me” is an unrestricted state, not an extra activity mixed into a selection. Scalar values such as maximum budget, travel radius, and slot start/end remain single values.

1. User creates a social profile.
2. Convene learns their interests, personality, preferences, and availability.
3. User saves blocks of time for social activity, with optional multi-select preferences; saving starts automatic matching.
4. Convene decides whether to:
   - Introduce them to someone new
   - Create a small group
   - Reconnect them with an existing friend
5. Convene finds an appropriate activity.
6. For in-person events, Convene determines a fair location and venue.
7. For online events, Convene determines a shared activity or event.
8. Convene schedules the hangout.
9. Afterward, lightweight feedback updates the user's preference profile.

## Onboarding and Interest Profile

Onboarding should combine a structured form with an LLM conversation.

### Initial Form

Collect concrete information such as:

- General interests
- Availability
- Online vs. in-person preference
- Maximum travel distance
- Preferred group sizes
- Social frequency
- Existing friends
- Languages
- Activities they enjoy
- Activities they want to try

### LLM Follow-Up

After the basic form, Convene acts like a friend getting to know the user and asks more expressive questions.

Examples:

- What kind of people do you usually get along with?
- Would you rather spend Saturday hiking or exploring a city?
- What's your favorite thing to eat?
- What's something you could talk about for hours?
- What kind of person inspires you?
- Are you more interested in ambitious people, laid-back people, outdoorsy people, etc.?
- What's something you've always wanted to try?

These can have a Hinge-prompt-like feel, where the answers reveal personality better than checkboxes.

The LLM converts answers into a structured interest/preference profile.

### Ongoing Learning

Convene should continue learning after onboarding.

Notifications can periodically ask low-friction questions such as:

- Coffee or boba?
- Concert or hiking trail?
- Would you try rock climbing if someone invited you?
- You've been doing a lot of gaming hangouts lately. Want Convene to prioritize outdoor plans next week?

Also include events nearby or that are world famous, like Barcelona winning the Champions League.

These interactions continuously refine the user's profile.

## Social Time Allocation

Users choose how much time they want Convene to manage.

Example:

> 4 social hours/week

- 2 hours meeting new people
- 1 hour with existing friends
- 1 hour reconnecting with people they haven't seen recently

The user could configure percentages or simply tell Convene:

> "I want to meet one new person every week and hang out with friends twice a month."

Convene translates that into scheduling goals.

Elaboration: use the Google Calendar API so Convene knows when the user is free, lets users time block free times, and adds events.

## New Connections

Convene matches users using a mixture of:

- Shared interests
- Complementary interests
- Personality/social preferences
- Availability
- Distance
- Preferred activities
- Preferred group size
- Previous social feedback
- Desire for familiarity vs. novelty

Matching should include controlled randomness.

Convene should not always choose the mathematically most similar person. Instead, it should choose from a set of sufficiently compatible people so that interactions still feel spontaneous.

An adventurous-to-comfortable slider determines whether people you meet are more likely to be different, while comfortable means you're more likely to meet similar people.

This creates the blind hangout experience.

## In-Person Hangouts

For an in-person match, Convene determines both what to do and where to do it.

### Inputs

- Participant locations
- Travel radius
- Transportation constraints
- Shared interests
- Budget
- Availability
- Venue hours
- Desired meeting length
- Preferred environment

### Example

Three users like:

- Board games
- Coffee
- Asian food

Convene identifies a geographically fair area and schedules:

> Saturday 2:30-4:00 PM  
> Board-game cafe

Location selection should optimize travel fairness, rather than simply choosing a geographic midpoint.

## Online Hangouts

Online meetings should still revolve around an actual shared experience rather than simply generating a video-call link.

Examples include:

- League duo queue
- Minecraft
- Discord gaming session
- Watch party
- Movie
- Collaborative playlist exchange
- Online board game
- Virtual study session
- Coding/project session
- Music-sharing session

Convene selects the activity based on the group's interests.

Include info like user platforms to communicate, such as Discord.

Example:

> You and Alex both play League casually and are free Wednesday night.  
> Convene schedules:  
> Wednesday, 8:30 PM - League Duo

## Friends and Relationship Graph

Users maintain a friends list containing:

- Existing friends
- People they meet through Convene
- Previous hangout history

After meeting someone, users can choose:

> Add to friends

Convene gradually builds a relationship graph rather than just a list of matches.

Relationship metadata may include:

- Number of previous meetings
- Last interaction
- Shared activities
- Mutual desire to meet again
- Typical interaction frequency

This allows Convene to manage both new and existing relationships.

## Reconnection

Convene should help prevent relationships from fading because nobody initiates plans.

For example:

> You and Jordan usually hang out once every few weeks, but you haven't seen each other in two months.

Convene notices:

- Both users want to reconnect
- Both are free Thursday
- Both frequently get food together

It schedules:

> Thursday, 7 PM - Dinner with Jordan

The product therefore supports two kinds of connection:

- Creating relationships
- Maintaining relationships

## International Exchange

Users can opt into international or cross-cultural meetings.

Profile information could include:

- Languages spoken
- Languages being learned
- Cultures they are interested in
- Things about their own culture they enjoy sharing
- Time zone availability

Convene can organize structured virtual exchanges.

## AI / Technical Components

Convene should use AI for areas involving fuzzy human preferences while keeping deterministic logic for hard constraints.

### Profile Agent

Transforms onboarding conversation into structured preferences.

### Matching Agent

Evaluates semantic compatibility between people beyond simple shared-interest tags.

### Social Graph / Relationship Agent

Determines whether the user's available social time should be spent on:

- Meeting someone new
- Strengthening a new connection
- Reconnecting with an existing friend

### Activity Planning Agent

Determines what the group should actually do.

### Location Agent

For in-person meetings:

- Searches candidate locations
- Considers travel times
- Evaluates interests and constraints
- Chooses a fair meeting point

### Online Experience Agent

Finds suitable:

- Games
- Watch-party content
- Activities
- Shared online events

### Scheduling Engine

Deterministically calculates overlapping availability and creates events.

### Feedback / Learning System

Uses lightweight post-event feedback to update future matching and activity preferences.

## High-Level Architecture

```text
User
 |
 v
Onboarding Form
 |
 v
LLM Profile Agent
 |
 v
Structured User Profile
 |
 +----------------+
 |                |
 v                v
Calendar     Social Graph
 |                |
 +-------+--------+
         |
         v
Candidate Generation
 |
 v
Compatibility Engine
 |
 v
Group / Friend Selection
 |
 v
Activity Planner
 |
 +--------+
 |        |
 v        v
In-Person Online
Planner   Planner
 |        |
 +---+----+
     |
     v
Scheduling Engine
 |
 v
Hangout
 |
 v
Lightweight Feedback
 |
 +----> Updated Profile
```

## MVP

For HackGT, the MVP can be considerably smaller than the full vision.

### Required

- User onboarding form
- Short LLM follow-up conversation
- Structured interest profile generated from onboarding
- Seeded database of users
- Weekly availability
- New-person matching
- Calendar overlap detection
- Automatic activity selection
- One working in-person planning flow
- One working online planning flow
- Generated scheduled hangout
- Friends list
- Simple post-hangout feedback

### Strong Demo Features

- Social graph visualization
- Explainable compatibility score
- Location optimization
- Controlled-random matching
- Reconnection with an existing friend
- "Plan my week" button

### Stretch Features

- Real calendar integration
- Live venue search
- Group formation optimization
- International matching
- Translation
- Automated notifications
- Dynamic relationship-strength model
- Real-time event discovery
