import { getEnv } from '@/lib/env'
import { demoTokenSecret } from './store'

/** The passphrase that encrypts stored calendar tokens: configured in connected mode, ephemeral in demo. */
export function configuredTokenSecret(): string {
  const env = getEnv()
  return env.mode === 'supabase' && env.googleCalendar
    ? env.googleCalendar.tokenSecret
    : demoTokenSecret()
}
