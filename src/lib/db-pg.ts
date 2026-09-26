import { Pool, type PoolClient } from 'pg'
import type { Db } from './db'

/** Connected-mode driver: a small `pg` pool. Suited to serverless where each instance is short-lived. */
export function openPgDb(connectionString: string): Db {
  const pool = new Pool({ connectionString, max: 4 })
  return {
    async query(sql, params) {
      const result = await pool.query(sql, params ? [...params] : undefined)
      return result.rows
    },
    async exec(sql) {
      await pool.query(sql)
    },
    transaction: (fn) => runInTransaction(pool, fn),
  }
}

function wrapClient(client: PoolClient): Db {
  const db: Db = {
    async query(sql, params) {
      const result = await client.query(sql, params ? [...params] : undefined)
      return result.rows
    },
    async exec(sql) {
      await client.query(sql)
    },
    // Already inside a transaction: nested calls just share it.
    transaction: (fn) => fn(db),
  }
  return db
}

async function runInTransaction<T>(pool: Pool, fn: (tx: Db) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const result = await fn(wrapClient(client))
    await client.query('commit')
    return result
  } catch (error) {
    await client.query('rollback').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}
