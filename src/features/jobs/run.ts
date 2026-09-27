import { hostname } from 'node:os'
import { drainInterestMemories } from '@/features/interests/jobs'
import { drainFeedbackMemoryJobs } from '@/features/feedback/memory-jobs'
import { configuredTokenSecret } from '@/features/calendar/config'
import { getDb } from '@/lib/db'
import { getProviders } from '@/lib/providers'
import { type TickSummary, runPlanningTick } from '@/features/planning/batch/driver'

/** One scheduler tick against the configured database and providers. */
export async function runJobsNow(options: { allBatches?: boolean } = {}): Promise<TickSummary> {
  const db = await getDb()
  await drainInterestMemories(db, getProviders().ai, Date.now)
  await drainFeedbackMemoryJobs(db, getProviders().ai, Date.now)
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
