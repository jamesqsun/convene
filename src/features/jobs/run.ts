import { hostname } from 'node:os'
import { getDb } from '@/lib/db'
import { getProviders } from '@/lib/providers'
import { type TickSummary, runPlanningTick } from '@/features/planning/batch/driver'

/** One scheduler tick against the configured database and providers. */
export async function runJobsNow(): Promise<TickSummary> {
  const db = await getDb()
  return runPlanningTick({
    db,
    providers: getProviders(),
    workerId: `${hostname()}:${process.pid}`,
    clock: Date.now,
  })
}
