import { describe, expect, it } from 'vitest'
import { hour, minute, zonedTime } from '@/lib/time'
import {
  type BatchState,
  catchupIntervalMs,
  dueBatches,
  isDateStillPlannable,
  maxBatchAttempts,
  targetDateFor,
} from './due'

const toronto = { cityKey: 'ca:ontario:toronto', timezone: 'America/Toronto' }
const auckland = { cityKey: 'nz:auckland:auckland', timezone: 'Pacific/Auckland' }
// Monday 2026-09-28 in Toronto.
const mondayMidnight = zonedTime(toronto.timezone, '2026-09-28')

const state = (overrides: Partial<BatchState>): BatchState => ({
  cityKey: toronto.cityKey,
  localDate: '2026-09-30',
  status: 'done',
  attempts: 1,
  finishedAt: mondayMidnight + 5 * minute,
  leaseExpiresAt: null,
  ...overrides,
})

describe('dueBatches', () => {
  it("Monday's batch targets Wednesday and is due once after midnight", () => {
    expect(targetDateFor(toronto, mondayMidnight)).toBe('2026-09-30')
    expect(dueBatches([toronto], [], mondayMidnight + minute)).toEqual([
      { ...toronto, localDate: '2026-09-30', kind: 'main' },
    ])
    const live = state({ status: 'running', leaseExpiresAt: mondayMidnight + 15 * minute })
    expect(dueBatches([toronto], [live], mondayMidnight + 10 * minute)).toEqual([])
  })

  it('retries a running pass whose lease lapsed, as a main pass', () => {
    const crashed = state({ status: 'running', leaseExpiresAt: mondayMidnight + 5 * minute })
    expect(dueBatches([toronto], [crashed], mondayMidnight + 10 * minute)[0]?.kind).toBe('main')
    expect(
      dueBatches(
        [toronto],
        [state({ status: 'running', leaseExpiresAt: null })],
        mondayMidnight + minute,
      )[0]?.kind,
    ).toBe('main')
    expect(
      dueBatches(
        [toronto],
        [state({ status: 'running', leaseExpiresAt: null, attempts: maxBatchAttempts })],
        mondayMidnight + minute,
      ),
    ).toEqual([])
  })

  it('does not run catch-up until an hour after the last pass, then does', () => {
    expect(dueBatches([toronto], [state({})], mondayMidnight + 30 * minute)).toEqual([])
    const later = mondayMidnight + 5 * minute + catchupIntervalMs
    expect(dueBatches([toronto], [state({})], later)).toEqual([
      { ...toronto, localDate: '2026-09-30', kind: 'catchup' },
    ])
  })

  it('stops catch-up once no window on the date can satisfy 48 hours', () => {
    expect(isDateStillPlannable(toronto.timezone, '2026-09-30', mondayMidnight + 22 * hour)).toBe(
      true,
    )
    expect(
      isDateStillPlannable(toronto.timezone, '2026-09-30', mondayMidnight + 23 * hour + minute),
    ).toBe(false)
    expect(
      dueBatches(
        [toronto],
        [state({ finishedAt: mondayMidnight })],
        mondayMidnight + 23 * hour + minute,
      ),
    ).toEqual([])
  })

  it('retries a failed main pass a bounded number of times', () => {
    expect(
      dueBatches([toronto], [state({ status: 'failed', attempts: 1 })], mondayMidnight + minute)[0]
        ?.kind,
    ).toBe('main')
    expect(
      dueBatches(
        [toronto],
        [state({ status: 'failed', attempts: maxBatchAttempts })],
        mondayMidnight + minute,
      ),
    ).toEqual([])
  })

  it('evaluates each city on its own clock', () => {
    // 00:30 Monday in Toronto is 17:30 Monday in Auckland, whose target is still Wednesday there.
    const due = dueBatches([toronto, auckland], [], mondayMidnight + 30 * minute)
    expect(due.map((batch) => [batch.cityKey, batch.localDate])).toEqual([
      [toronto.cityKey, '2026-09-30'],
      [auckland.cityKey, '2026-09-30'],
    ])
    // A few hours later Auckland has crossed midnight into Tuesday and now targets Thursday.
    const aucklandTuesday = zonedTime(auckland.timezone, '2026-09-29') + minute
    expect(targetDateFor(auckland, aucklandTuesday)).toBe('2026-10-01')
  })
})
