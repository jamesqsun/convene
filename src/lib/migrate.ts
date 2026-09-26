import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Db } from './db'

export const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations')

/**
 * Applies every `*.sql` file in `dir` in name order, once. Each file runs in its own transaction
 * and is recorded in `schema_migrations`, so re-running is a no-op. Returns the names applied.
 */
export async function applyMigrations(db: Db, dir = migrationsDir): Promise<string[]> {
  await db.exec(
    'create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())',
  )
  const applied = new Set(
    (await db.query<{ name: string }>('select name from schema_migrations')).map((row) => row.name),
  )
  const files = (await readdir(dir)).filter((name) => name.endsWith('.sql')).sort()
  const newlyApplied: string[] = []
  for (const name of files) {
    if (applied.has(name)) continue
    const sql = await readFile(path.join(dir, name), 'utf8')
    await db.transaction(async (tx) => {
      await tx.exec(sql)
      await tx.query('insert into schema_migrations (name) values ($1)', [name])
    })
    newlyApplied.push(name)
  }
  return newlyApplied
}
