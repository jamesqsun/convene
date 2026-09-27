import { expect, it } from 'vitest'
import { asRole, createTestDb } from '../tests/harness'

it('keeps city job metadata private and enforces one job per city/date', async () => {
  const db = await createTestDb()
  const insert =
    "insert into city_interest_jobs (city_key, local_date, city_name, timezone) values ('toronto', '2026-10-01', 'Toronto', 'America/Toronto')"
  await db.exec(insert)
  await expect(db.exec(insert)).rejects.toThrow()
  await db.exec('grant select on city_interest_jobs to anon, authenticated')
  for (const role of ['anon', 'authenticated'] as const)
    expect(await asRole(db, role, (tx) => tx.query('select * from city_interest_jobs'))).toEqual([])
})
