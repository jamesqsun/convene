import { z } from 'zod'

/**
 * The only module that reads process.env.
 *
 * Demo mode deliberately parses none of the provider secrets, so a demo server can never reach a
 * live database, OpenAI, Google, or a push service by accident even if keys are present.
 */

const connectedSchema = z.object({
  DATABASE_URL: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  CRON_SECRET: z.string().min(16, 'CRON_SECRET must be at least 16 characters'),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).default('gpt-6-luna'),
  OPENAI_EMBEDDING_MODEL: z.string().min(1).default('text-embedding-3-small'),
  GOOGLE_PLACES_API_KEY: z.string().min(1).optional(),
  VAPID_PUBLIC_KEY: z.string().min(1).optional(),
  VAPID_PRIVATE_KEY: z.string().min(1).optional(),
  VAPID_SUBJECT: z
    .string()
    .regex(/^(mailto:|https:)/, 'VAPID_SUBJECT must start with mailto: or https:')
    .optional(),
  SEED_PASSWORD: z.string().min(8).default('convene-demo'),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  CALENDAR_TOKEN_SECRET: z
    .string()
    .min(32, 'CALENDAR_TOKEN_SECRET must be at least 32 characters')
    .optional(),
})

export interface OpenAiConfig {
  apiKey: string
  model: string
  embeddingModel: string
}

export interface VapidConfig {
  publicKey: string
  privateKey: string
  subject: string
}

export interface GoogleCalendarConfig {
  clientId: string
  clientSecret: string
  /** Encrypts stored refresh tokens. */
  tokenSecret: string
}

export interface DemoEnv {
  mode: 'demo'
}

export interface ConnectedEnv {
  mode: 'supabase'
  databaseUrl: string
  supabase: { url: string; publishableKey: string; serviceRoleKey: string }
  cronSecret: string
  openai: OpenAiConfig | null
  googlePlacesApiKey: string | null
  vapid: VapidConfig | null
  googleCalendar: GoogleCalendarConfig | null
  seedPassword: string
}

export type Env = DemoEnv | ConnectedEnv

export class EnvError extends Error {}

/** Empty strings in .env files mean "unset"; drop them before validation. */
function withoutBlanks(source: Record<string, string | undefined>): Record<string, string> {
  const entries = Object.entries(source).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== '',
  )
  return Object.fromEntries(entries)
}

function readVapid(raw: z.infer<typeof connectedSchema>): VapidConfig | null {
  const values = [raw.VAPID_PUBLIC_KEY, raw.VAPID_PRIVATE_KEY, raw.VAPID_SUBJECT]
  const setCount = values.filter(Boolean).length
  if (setCount === 0) return null
  if (setCount !== 3) {
    throw new EnvError(
      'VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT must be set together',
    )
  }
  return { publicKey: values[0]!, privateKey: values[1]!, subject: values[2]! }
}

function readGoogleCalendar(raw: z.infer<typeof connectedSchema>): GoogleCalendarConfig | null {
  const values = [raw.GOOGLE_CLIENT_ID, raw.GOOGLE_CLIENT_SECRET]
  const setCount = values.filter(Boolean).length
  if (setCount === 0) return null
  if (setCount !== 2)
    throw new EnvError('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together')
  if (!raw.CALENDAR_TOKEN_SECRET)
    throw new EnvError('CALENDAR_TOKEN_SECRET is required when Google Calendar is configured')
  return { clientId: values[0]!, clientSecret: values[1]!, tokenSecret: raw.CALENDAR_TOKEN_SECRET }
}

function readConnected(source: Record<string, string>): ConnectedEnv {
  const parsed = connectedSchema.safeParse(source)
  if (!parsed.success) {
    throw new EnvError(
      `Invalid environment for CONVENE_MODE=supabase:\n${z.prettifyError(parsed.error)}`,
    )
  }
  const raw = parsed.data
  return {
    mode: 'supabase',
    databaseUrl: raw.DATABASE_URL,
    supabase: {
      url: raw.NEXT_PUBLIC_SUPABASE_URL,
      publishableKey: raw.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      serviceRoleKey: raw.SUPABASE_SERVICE_ROLE_KEY,
    },
    cronSecret: raw.CRON_SECRET,
    openai: raw.OPENAI_API_KEY
      ? {
          apiKey: raw.OPENAI_API_KEY,
          model: raw.OPENAI_MODEL,
          embeddingModel: raw.OPENAI_EMBEDDING_MODEL,
        }
      : null,
    googlePlacesApiKey: raw.GOOGLE_PLACES_API_KEY ?? null,
    vapid: readVapid(raw),
    googleCalendar: readGoogleCalendar(raw),
    seedPassword: raw.SEED_PASSWORD,
  }
}

/** Pure parser used by getEnv() and by tests. */
export function readEnv(source: Record<string, string | undefined>): Env {
  const cleaned = withoutBlanks(source)
  const mode = cleaned.CONVENE_MODE ?? 'demo'
  if (mode === 'demo') return { mode: 'demo' }
  if (mode !== 'supabase')
    throw new EnvError(`CONVENE_MODE must be "demo" or "supabase", got "${mode}"`)
  return readConnected(cleaned)
}

let cached: Env | null = null

export function getEnv(): Env {
  cached ??= readEnv(process.env)
  return cached
}

export function isDemoMode(): boolean {
  return getEnv().mode === 'demo'
}
