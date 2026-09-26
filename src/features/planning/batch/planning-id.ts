import { createHash } from 'node:crypto'
import type { BucketMember } from '../types'

/**
 * A stable identity for a proposed group. The same batch pass and the same member/slot/revision
 * set always produce the same id, so a crash retry re-finds its proposal instead of creating a
 * competing one, and the events table's unique planning_id makes the commit idempotent.
 */
export function planningIdFor(
  batchId: string,
  pass: number,
  members: readonly BucketMember[],
): string {
  const memberKeys = members
    .map((member) => `${member.userId}:${member.slotId}:${member.revision}`)
    .sort()
    .join(',')
  return createHash('sha256').update(`${batchId}:${pass}:${memberKeys}`).digest('hex')
}
