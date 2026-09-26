import { describe, expect, it } from 'vitest'
import { createPgliteDb } from './db-pglite'

describe('createPgliteDb', () => {
  it('runs queries with parameters and returns typed rows', async () => {
    const db = await createPgliteDb()
    await db.exec('create extension if not exists vector')
    const rows = await db.query<{ n: number; when: Date; ids: string[]; doc: { a: number } }>(
      'select $1::int as n, $2::timestamptz as when, $3::uuid[] as ids, $4::jsonb as doc',
      [
        7,
        '2026-01-01T00:00:00Z',
        ['00000000-0000-0000-0000-000000000001'],
        JSON.stringify({ a: 1 }),
      ],
    )
    expect(rows[0]?.n).toBe(7)
    expect(rows[0]?.when).toBeInstanceOf(Date)
    expect(rows[0]?.ids).toEqual(['00000000-0000-0000-0000-000000000001'])
    expect(rows[0]?.doc).toEqual({ a: 1 })
  })

  it('rolls back a transaction when the callback throws', async () => {
    const db = await createPgliteDb()
    await db.exec('create table items (id int primary key)')
    await expect(
      db.transaction(async (tx) => {
        await tx.query('insert into items values (1)')
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(await db.query('select * from items')).toEqual([])
  })

  it('commits a transaction and shares it with nested calls', async () => {
    const db = await createPgliteDb()
    await db.exec('create table items (id int primary key)')
    await db.transaction(async (tx) => {
      await tx.query('insert into items values (1)')
      await tx.transaction(async (inner) => inner.query('insert into items values (2)'))
    })
    expect(await db.query<{ id: number }>('select id from items order by id')).toEqual([
      { id: 1 },
      { id: 2 },
    ])
  })
})
