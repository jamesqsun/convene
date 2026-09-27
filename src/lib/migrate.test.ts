import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createPgliteDb } from './db-pglite'
import { applyMigrations, pendingMigrations } from './migrate'

async function migrationsFixture(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'convene-migrations-'))
  await writeFile(path.join(dir, '0002_second.sql'), 'insert into notes values (2);')
  await writeFile(
    path.join(dir, '0001_first.sql'),
    'create table notes (id int primary key); insert into notes values (1);',
  )
  await writeFile(path.join(dir, 'README.md'), 'not a migration')
  return dir
}

describe('pendingMigrations', () => {
  it('lists unapplied files in name order without changing the database', async () => {
    const db = await createPgliteDb()
    const dir = await migrationsFixture()
    expect(await pendingMigrations(db, dir)).toEqual(['0001_first.sql', '0002_second.sql'])
    await expect(db.query('select 1 from schema_migrations')).rejects.toThrow()
    await expect(db.query('select 1 from notes')).rejects.toThrow()
  })

  it('lists only what was added since the last run', async () => {
    const db = await createPgliteDb()
    const dir = await migrationsFixture()
    await applyMigrations(db, dir)
    expect(await pendingMigrations(db, dir)).toEqual([])
    await writeFile(path.join(dir, '0003_third.sql'), 'insert into notes values (3);')
    expect(await pendingMigrations(db, dir)).toEqual(['0003_third.sql'])
  })
})

describe('applyMigrations', () => {
  it('applies sql files in name order exactly once', async () => {
    const db = await createPgliteDb()
    const dir = await migrationsFixture()
    expect(await applyMigrations(db, dir)).toEqual(['0001_first.sql', '0002_second.sql'])
    expect(await applyMigrations(db, dir)).toEqual([])
    expect(await db.query<{ id: number }>('select id from notes order by id')).toEqual([
      { id: 1 },
      { id: 2 },
    ])
  })

  it('rolls back a failing migration and leaves it unrecorded', async () => {
    const db = await createPgliteDb()
    const dir = await mkdtemp(path.join(os.tmpdir(), 'convene-migrations-'))
    await writeFile(
      path.join(dir, '0001_bad.sql'),
      'create table t (id int); insert into t values (1); select 1/0;',
    )
    await expect(applyMigrations(db, dir)).rejects.toThrow()
    expect(await db.query('select name from schema_migrations')).toEqual([])
    await expect(db.query('select * from t')).rejects.toThrow()
  })
})
