import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Db } from './db'

export const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations')

/** The `*.sql` files in `dir` that are not applied yet, in name order. Changes nothing. */
export async function pendingMigrations(db: Db, dir = migrationsDir): Promise<string[]> {
  const record = await db.query<{ is_present: boolean }>(
    "select to_regclass('public.schema_migrations') is not null as is_present",
  )
  const rows = record[0]?.is_present
    ? await db.query<{ name: string }>('select name from schema_migrations')
    : []
  const applied = new Set(rows.map((row) => row.name))
  const files = (await readdir(dir)).filter((name) => name.endsWith('.sql')).sort()
  return files.filter((name) => !applied.has(name))
}

/**
 * Applies every `*.sql` file in `dir` in name order, once. Each file runs in its own transaction
 * and is recorded in `schema_migrations`, so re-running is a no-op. Returns the names applied.
 */
export async function applyMigrations(db: Db, dir = migrationsDir): Promise<string[]> {
  await db.exec(
    'create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())',
  )
  const newlyApplied: string[] = []
  for (const name of await pendingMigrations(db, dir)) {
    const sql = await readFile(path.join(dir, name), 'utf8')
    await db.transaction(async (tx) => {
      await tx.exec(sql)
      await tx.query('insert into schema_migrations (name) values ($1)', [name])
    })
    newlyApplied.push(name)
  }
  return newlyApplied
}
