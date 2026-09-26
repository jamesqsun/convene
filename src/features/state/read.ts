import { type Slot, listSlots } from '@/features/availability/store'
import { expectedBatchAt, slotStateFor } from '@/features/availability/slot-state'
import { type Hangout, type Plan, loadHangouts, loadPlans } from '@/features/events/read'
import { onboardingStepFor } from '@/features/profile/onboarding-step'
import { loadProfile } from '@/features/profile/store'
import type { Db } from '@/lib/db'
import { HttpError } from '@/lib/http'

/** Everything the app shell polls for. Assembled from feature reads that each enforce privacy. */
export interface AppState {
  serverNow: number
  profile: {
    userId: string
    name: string
    onboardingStep: string
    timezone: string | null
    cityLabel: string | null
    memoryCount: number
    isRepeatingAvailability: boolean
  }
  slots: (Slot & { state: string; expectedBatchAt: number })[]
  plans: Plan[]
  hangouts: Hangout[]
}

export async function loadState(db: Db, userId: string, now: number): Promise<AppState> {
  const profile = await loadProfile(db, userId)
  if (!profile) throw new HttpError(404, 'profile_missing', 'Profile not found')
  const [slots, plans, hangouts] = await Promise.all([
    listSlots(db, userId, now),
    loadPlans(db, userId, now),
    loadHangouts(db, userId, now),
  ])
  return {
    serverNow: now,
    profile: {
      userId,
      name: profile.name,
      onboardingStep: onboardingStepFor({
        ...profile,
        hasCity: profile.city !== null,
        answerCount: profile.answers.length,
      }),
      timezone: profile.city?.timezone ?? null,
      cityLabel: profile.city?.name ?? null,
      memoryCount: profile.memoryCount,
      isRepeatingAvailability: profile.isRepeatingAvailability,
    },
    slots: slots.map((slot) => ({
      ...slot,
      state: slotStateFor(slot, now),
      expectedBatchAt: expectedBatchAt(slot),
    })),
    plans,
    hangouts,
  }
}
