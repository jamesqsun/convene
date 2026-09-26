import { getEnv } from './env'
import { openPgDb } from './db-pg'
import { openDemoDb } from './db-pglite'

/**
 * The one database interface the whole server uses.
 *
 * Two implementations exist: `pg` against Supabase Postgres (connected mode) and PGlite, an
 * in-process WASM Postgres (demo mode and tests). Both run the same SQL and the same migrations,
 * so demo mode exercises the real transactions rather than a parallel in-memory store.
 *
 * Conventions that keep the two drivers interchangeable:
 * - timestamptz columns come back as Date objects from both drivers.
 * - bigint counts are cast to int in SQL (`count(*)::int`) because `pg` returns bigint as string.
 * - range columns are never read as text (their text form depends on the session time zone);
 *   select `lower(col)` and `upper(col)` instead.
 * - jsonb parameters are passed as JSON strings with an explicit `::jsonb` cast.
 */
export interface Db {
  query<Row = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<Row[]>
  /** Runs one or more statements without parameters (used for migrations). */
  exec(sql: string): Promise<void>
  /** Runs `fn` inside BEGIN/COMMIT, rolling back if it throws. */
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>
}

/** Returns the first row or null; a convenience for point lookups. */
export async function queryOne<Row>(
  db: Db,
  sql: string,
  params?: readonly unknown[],
): Promise<Row | null> {
  const rows = await db.query<Row>(sql, params)
  return rows[0] ?? null
}

// Cached on globalThis so the dev server's module reloads reuse one connection pool / PGlite.
const globalState = globalThis as unknown as { __conveneDb?: Promise<Db> }

export function getDb(): Promise<Db> {
  globalState.__conveneDb ??= openDb()
  return globalState.__conveneDb
}

async function openDb(): Promise<Db> {
  const env = getEnv()
  if (env.mode === 'demo') return openDemoDb()
  return openPgDb(env.databaseUrl)
}
