import { beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '@/lib/db'
import { hour, zonedTime } from '@/lib/time'
import { createTestDb, createUser } from '../../../supabase/tests/harness'
import { createSlot, listSlots, reopenSlot, transitionSlot, updateSlot, windowFor } from './store'

let db: Db
const tz = 'America/Toronto'
const now = zonedTime(tz, '2026-09-28', 9)

beforeAll(async () => {
  db = await createTestDb()
})

describe('windowFor', () => {
  it('interprets clock times in the zone and wraps past midnight', () => {
    expect(
      windowFor({ date: '2026-10-03', startTime: '18:00', endTime: '21:00' }, tz, now),
    ).toEqual({ start: zonedTime(tz, '2026-10-03', 18), end: zonedTime(tz, '2026-10-03', 21) })
    expect(
      windowFor({ date: '2026-10-03', startTime: '22:00', endTime: '01:00' }, tz, now).end,
    ).toBe(zonedTime(tz, '2026-10-04', 1))
  })

  it('rejects windows that are too short, too long, or too soon', () => {
    expect(() =>
      windowFor({ date: '2026-10-03', startTime: '18:00', endTime: '18:59' }, tz, now),
    ).toThrow(/one hour/)
    expect(() =>
      windowFor({ date: '2026-10-03', startTime: '06:00', endTime: '23:00' }, tz, now),
    ).toThrow(/sixteen/)
    expect(() =>
      windowFor({ date: '2026-09-30', startTime: '08:00', endTime: '09:30' }, tz, now),
    ).toThrow(/48 hours/)
    expect(
      windowFor({ date: '2026-09-30', startTime: '09:00', endTime: '10:00' }, tz, now).start,
    ).toBe(zonedTime(tz, '2026-09-30', 9))
  })
})

describe('slot store', () => {
  it('creates, lists, edits with revision bumps, and rejects overlaps', async () => {
    const userId = await createUser(db)
    const window = windowFor({ date: '2026-10-03', startTime: '18:00', endTime: '21:00' }, tz, now)
    const slot = await createSlot(db, userId, window, tz)
    expect(slot).toMatchObject({
      status: 'pending',
      revision: 1,
      assignedEventId: null,
      timezone: tz,
    })
    await expect(
      createSlot(db, userId, { start: window.start + hour, end: window.end + hour }, tz),
    ).rejects.toMatchObject({ status: 409 })
    const edited = await updateSlot(db, userId, slot.id, {
      start: window.start,
      end: window.end + hour,
    })
    expect(edited.revision).toBe(2)
    expect((await listSlots(db, userId, now)).map((s) => s.id)).toEqual([slot.id])
    expect(await listSlots(db, userId, window.end + 2 * hour)).toEqual([])
    const other = await createUser(db)
    await expect(updateSlot(db, other, slot.id, window)).rejects.toMatchObject({ status: 404 })
  })

  it('pauses, reopens while viable, removes, and refuses locked transitions', async () => {
    const userId = await createUser(db)
    const window = windowFor({ date: '2026-10-03', startTime: '18:00', endTime: '21:00' }, tz, now)
    const slot = await createSlot(db, userId, window, tz)
    const paused = await transitionSlot(db, userId, slot.id, ['pending'], 'paused')
    expect(paused.status).toBe('paused')
    await expect(transitionSlot(db, userId, slot.id, ['pending'], 'paused')).rejects.toMatchObject({
      status: 409,
    })
    expect((await reopenSlot(db, userId, slot.id, now)).status).toBe('pending')
    await transitionSlot(db, userId, slot.id, ['pending'], 'paused')
    await expect(reopenSlot(db, userId, slot.id, window.end - 47 * hour)).rejects.toMatchObject({
      code: 'too_soon',
    })
    const removed = await transitionSlot(db, userId, slot.id, ['pending', 'paused'], 'cancelled')
    expect(removed.status).toBe('cancelled')
    await expect(updateSlot(db, userId, slot.id, window)).rejects.toMatchObject({
      code: 'slot_locked',
    })
  })
})
