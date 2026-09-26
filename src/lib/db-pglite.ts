import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { PGlite, type Transaction } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { vector } from '@electric-sql/pglite-pgvector'
import { fakeCalendarProvider } from '@/features/calendar/fake'
import { demoTokenSecret } from '@/features/calendar/store'
import { fakeAiProvider } from '@/features/openai/fake'
import { seedDemoWorld } from '@/features/seed/seed'
import type { Db } from './db'
import { applyMigrations } from './migrate'

/** Demo-mode and test driver: an in-process WASM Postgres with the two extensions the schema needs. */
export async function createPgliteDb(): Promise<Db> {
  const pg = new PGlite({ extensions: { vector, btree_gist } })
  await pg.waitReady
  return wrapPglite(pg)
}

/**
 * Supabase provides the `auth` schema and the `anon`/`authenticated` roles; PGlite does not.
 * This shim creates just enough of them for the migrations to apply unchanged.
 */
export async function applyAuthShim(db: Db): Promise<void> {
  const shimPath = path.join(process.cwd(), 'supabase', 'demo', 'auth-shim.sql')
  await db.exec(await readFile(shimPath, 'utf8'))
}

/** A fresh, fully migrated database. Used by tests and by the demo server. */
export async function createMigratedDb(): Promise<Db> {
  const db = await createPgliteDb()
  await applyAuthShim(db)
  await applyMigrations(db)
  return db
}

/** The demo server's database: migrated and populated with the fictional world on first use. */
export async function openDemoDb(): Promise<Db> {
  const db = await createMigratedDb()
  const summary = await seedDemoWorld(db, fakeAiProvider(), {
    now: Date.now(),
    calendar: { provider: fakeCalendarProvider(), tokenSecret: demoTokenSecret() },
  })
  console.info(
    `[demo] seeded ${summary.people} people, ${summary.slots} slots, ${summary.historyEvents} past hangouts, ${summary.calendarsConnected} calendars`,
  )
  return db
}

type Queryable = Pick<PGlite, 'query' | 'exec'> | Pick<Transaction, 'query' | 'exec'>

function wrapQueryable(target: Queryable, transaction: Db['transaction']): Db {
  return {
    async query(sql, params) {
      const result = await target.query(sql, params ? [...params] : undefined)
      return result.rows as never
    },
    async exec(sql) {
      await target.exec(sql)
    },
    transaction,
  }
}

function wrapPglite(pg: PGlite): Db {
  return wrapQueryable(pg, (fn) =>
    pg.transaction(async (tx) => {
      // PGlite exposes no nested transactions; inner calls share the outer one.
      const inner: Db = wrapQueryable(tx, (nested) => nested(inner))
      return fn(inner)
    }),
  )
}
