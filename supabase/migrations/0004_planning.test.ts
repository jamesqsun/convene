import { beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '@/lib/db'
import { createBatch, createProposal, createSlot, createTestDb, createUser } from '../tests/harness'

let db: Db

beforeAll(async () => {
  db = await createTestDb()
})

describe('planning_batches', () => {
  it('has one row per city and local date', async () => {
    await createBatch(db, '2026-10-03')
    await expect(createBatch(db, '2026-10-03')).rejects.toThrow(/unique|duplicate/)
    await expect(createBatch(db, '2026-10-04')).resolves.toBeDefined()
  })

  it('constrains status', async () => {
    const batchId = await createBatch(db, '2026-10-05')
    await expect(
      db.query("update planning_batches set status = 'paused' where id = $1", [batchId]),
    ).rejects.toThrow(/status/)
  })
})

describe('planning_proposals', () => {
  it('requires an array of members and an ordered window', async () => {
    const batchId = await createBatch(db, '2026-10-06')
    const userId = await createUser(db)
    const slot = await createSlot(db, userId, '2026-10-06T20:00:00Z', '2026-10-06T22:00:00Z')
    const members = [{ user_id: userId, slot_id: slot.id, revision: slot.revision }]
    await expect(
      createProposal(db, {
        batchId,
        members,
        startIso: '2026-10-06T21:00:00Z',
        endIso: '2026-10-06T20:00:00Z',
      }),
    ).rejects.toThrow()
    await expect(
      db.query(
        `insert into planning_proposals (planning_id, batch_id, pass, members, shared_start, shared_end)
         values ('bad', $1, 1, '{}'::jsonb, '2026-10-06T20:00:00Z', '2026-10-06T21:00:00Z')`,
        [batchId],
      ),
    ).rejects.toThrow(/members/)
  })

  it('is removed with its batch', async () => {
    const batchId = await createBatch(db, '2026-10-07')
    const userId = await createUser(db)
    const slot = await createSlot(db, userId, '2026-10-07T20:00:00Z', '2026-10-07T22:00:00Z')
    const members = [{ user_id: userId, slot_id: slot.id, revision: slot.revision }]
    const planningId = await createProposal(db, {
      batchId,
      members,
      startIso: '2026-10-07T20:00:00Z',
      endIso: '2026-10-07T21:00:00Z',
    })
    await db.query('delete from planning_batches where id = $1', [batchId])
    expect(
      await db.query('select 1 from planning_proposals where planning_id = $1', [planningId]),
    ).toEqual([])
  })
})
