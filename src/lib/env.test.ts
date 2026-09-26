import { describe, expect, it } from 'vitest'
import { EnvError, readEnv } from './env'

const connected = {
  CONVENE_MODE: 'supabase',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/convene',
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'pk',
  SUPABASE_SERVICE_ROLE_KEY: 'sk',
  CRON_SECRET: 'a-very-long-random-secret',
}

describe('readEnv', () => {
  it('defaults to demo mode and ignores provider keys', () => {
    expect(readEnv({ OPENAI_API_KEY: 'sk-live' })).toEqual({ mode: 'demo' })
  })

  it('treats blank values as unset', () => {
    expect(readEnv({ CONVENE_MODE: '' })).toEqual({ mode: 'demo' })
  })

  it('rejects unknown modes', () => {
    expect(() => readEnv({ CONVENE_MODE: 'prod' })).toThrow(EnvError)
  })

  it('requires database, supabase, and cron settings in connected mode', () => {
    expect(() => readEnv({ CONVENE_MODE: 'supabase' })).toThrow(/DATABASE_URL/)
  })

  it('parses connected mode with defaults for optional providers', () => {
    const env = readEnv(connected)
    expect(env.mode).toBe('supabase')
    if (env.mode !== 'supabase') return
    expect(env.openai).toBeNull()
    expect(env.googlePlacesApiKey).toBeNull()
    expect(env.vapid).toBeNull()
    expect(env.seedPassword).toBe('convene-demo')
  })

  it('applies model defaults when an OpenAI key is present', () => {
    const env = readEnv({ ...connected, OPENAI_API_KEY: 'sk' })
    if (env.mode !== 'supabase') throw new Error('expected connected')
    expect(env.openai).toEqual({
      apiKey: 'sk',
      model: 'gpt-6-luna',
      embeddingModel: 'text-embedding-3-small',
    })
  })

  it('requires all three VAPID values together', () => {
    expect(() => readEnv({ ...connected, VAPID_PUBLIC_KEY: 'pub' })).toThrow(/together/)
    const env = readEnv({
      ...connected,
      VAPID_PUBLIC_KEY: 'pub',
      VAPID_PRIVATE_KEY: 'priv',
      VAPID_SUBJECT: 'mailto:ops@example.com',
    })
    if (env.mode !== 'supabase') throw new Error('expected connected')
    expect(env.vapid?.subject).toBe('mailto:ops@example.com')
  })

  it('rejects a short cron secret', () => {
    expect(() => readEnv({ ...connected, CRON_SECRET: 'short' })).toThrow(/CRON_SECRET/)
  })
})
