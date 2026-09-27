import { hostname } from 'node:os'
import { configuredTokenSecret } from '@/features/calendar/config'
import { getDb } from '@/lib/db'
import { getProviders } from '@/lib/providers'
import { type TickSummary, runPlanningTick } from '@/features/planning/batch/driver'

/** One scheduler tick against the configured database and providers. */
export async function runJobsNow(options: { allBatches?: boolean } = {}): Promise<TickSummary> {
  const db = await getDb()
  return runPlanningTick(
    {
      db,
      providers: getProviders(),
      workerId: `${hostname()}:${process.pid}`,
      clock: Date.now,
      tokenSecret: configuredTokenSecret(),
    },
    options,
  )
}
