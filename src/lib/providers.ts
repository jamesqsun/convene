import { fakeCalendarProvider } from '@/features/calendar/fake'
import { googleCalendarProvider } from '@/features/calendar/google'
import type { CalendarProvider } from '@/features/calendar/provider'
import { fakeAiProvider } from '@/features/ai/fake'
import type { AiProvider } from '@/features/ai/provider'
import { metaAiProvider } from '@/features/ai/real'
import { embedderFor } from '@/features/ai/embeddings'
import { fictionalVenueProvider } from '@/features/planning/venues/fictional'
import { googlePlacesProvider } from '@/features/planning/venues/google-places'
import type { VenueProvider } from '@/features/planning/venues/provider'
import { fakePushSender } from '@/features/push/fake'
import type { PushSender } from '@/features/push/provider'
import { webPushSender } from '@/features/push/real'
import { type Env, getEnv } from './env'

/**
 * External-service selection. Demo mode always gets the fakes. Connected mode gets a real
 * provider only when its key is configured, otherwise the documented fallback.
 */
export interface Providers {
  ai: AiProvider
  venues: VenueProvider
  push: PushSender
  /** Null in connected mode without Google credentials: the calendar features are hidden. */
  calendar: CalendarProvider | null
}

export function providersFor(env: Env): Providers {
  if (env.mode === 'demo') {
    return {
      ai: fakeAiProvider(),
      venues: fictionalVenueProvider(),
      push: fakePushSender(true),
      calendar: fakeCalendarProvider(),
    }
  }
  return {
    ai:
      env.meta && env.embeddings
        ? metaAiProvider(env.meta, embedderFor(env.embeddings))
        : fakeAiProvider(),
    venues: env.googlePlacesApiKey
      ? googlePlacesProvider(env.googlePlacesApiKey)
      : fictionalVenueProvider(),
    push: env.vapid ? webPushSender(env.vapid) : fakePushSender(true),
    calendar: env.googleCalendar ? googleCalendarProvider(env.googleCalendar) : null,
  }
}

let cached: Providers | null = null

export function getProviders(): Providers {
  cached ??= providersFor(getEnv())
  return cached
}
