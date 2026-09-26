import { describe, expect, it } from 'vitest'
import { readEnv } from './env'
import { providersFor } from './providers'

const connected = {
  CONVENE_MODE: 'supabase',
  DATABASE_URL: 'postgresql://u:p@h/db',
  NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'pk',
  SUPABASE_SERVICE_ROLE_KEY: 'sk',
  CRON_SECRET: 'a-very-long-random-secret',
}

describe('providersFor', () => {
  it('uses fakes in demo mode even when keys are present', () => {
    const providers = providersFor(
      readEnv({ META_API_KEY: 'sk', GEMINI_API_KEY: 'gk', GOOGLE_PLACES_API_KEY: 'g' }),
    )
    expect([providers.ai.kind, providers.venues.kind, providers.push.kind]).toEqual([
      'fake',
      'fictional',
      'fake',
    ])
  })

  it('falls back per provider in connected mode', () => {
    const bare = providersFor(readEnv(connected))
    expect([bare.ai.kind, bare.venues.kind, bare.push.kind, bare.calendar]).toEqual([
      'fake',
      'fictional',
      'fake',
      null,
    ])
    const full = providersFor(
      readEnv({
        ...connected,
        META_API_KEY: 'sk',
        GEMINI_API_KEY: 'gk',
        GOOGLE_CLIENT_ID: 'client-id',
        GOOGLE_CLIENT_SECRET: 'client-secret',
        CALENDAR_TOKEN_SECRET: 'x'.repeat(32),
        GOOGLE_PLACES_API_KEY: 'g',
        VAPID_PUBLIC_KEY: 'pub',
        VAPID_PRIVATE_KEY: 'priv',
        VAPID_SUBJECT: 'mailto:ops@example.com',
      }),
    )
    expect([full.ai.kind, full.venues.kind, full.push.kind]).toEqual([
      'meta',
      'google_places',
      'web_push',
    ])
    expect(full.calendar?.kind).toBe('google')
  })
})
