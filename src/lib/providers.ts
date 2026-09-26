import { fakeAiProvider } from '@/features/openai/fake'
import type { AiProvider } from '@/features/openai/provider'
import { openAiProvider } from '@/features/openai/real'
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
}

export function providersFor(env: Env): Providers {
  if (env.mode === 'demo') {
    return { ai: fakeAiProvider(), venues: fictionalVenueProvider(), push: fakePushSender(true) }
  }
  return {
    ai: env.openai ? openAiProvider(env.openai) : fakeAiProvider(),
    venues: env.googlePlacesApiKey
      ? googlePlacesProvider(env.googlePlacesApiKey)
      : fictionalVenueProvider(),
    push: env.vapid ? webPushSender(env.vapid) : fakePushSender(true),
  }
}

let cached: Providers | null = null

export function getProviders(): Providers {
  cached ??= providersFor(getEnv())
  return cached
}
