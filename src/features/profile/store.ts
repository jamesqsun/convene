import type { CityMatch } from '@/features/cities/search'
import type { Db } from '@/lib/db'
import { isOnboardingComplete } from './onboarding-step'
import type { Answer, ProfilePatch } from './schemas'

export interface ProfileCity {
  key: string
  name: string
  timezone: string
  lat: number
  lng: number
}

export interface Profile {
  id: string
  name: string
  age: number | null
  city: ProfileCity | null
  phone: string | null
  interests: string[]
  answers: Answer[]
  onboardingCompletedAt: number | null
  memoryCount: number
}

interface ProfileRow {
  id: string
  name: string
  age: number | null
  city_key: string | null
  city_name: string | null
  city_timezone: string | null
  city_lat: number | null
  city_lng: number | null
  phone_e164: string | null
  interests: string[]
  onboarding_answers: Answer[]
  onboarding_completed_at: Date | null
  memory_count: number
}

function toProfile(row: ProfileRow): Profile {
  const hasCity = row.city_key !== null && row.city_timezone !== null
  return {
    id: row.id,
    name: row.name,
    age: row.age,
    city: hasCity
      ? {
          key: row.city_key!,
          name: row.city_name ?? '',
          timezone: row.city_timezone!,
          lat: row.city_lat ?? 0,
          lng: row.city_lng ?? 0,
        }
      : null,
    phone: row.phone_e164,
    interests: row.interests,
    answers: row.onboarding_answers,
    onboardingCompletedAt: row.onboarding_completed_at?.getTime() ?? null,
    memoryCount: row.memory_count,
  }
}

export async function loadProfile(db: Db, userId: string): Promise<Profile | null> {
  const rows = await db.query<ProfileRow>(
    `select p.*, (select count(*)::int from preference_memories m where m.user_id = p.id) as memory_count
     from profiles p where p.id = $1`,
    [userId],
  )
  return rows[0] ? toProfile(rows[0]) : null
}

export interface ResolvedPatch extends Omit<ProfilePatch, 'cityKey' | 'phone'> {
  city?: CityMatch
  phone?: string
}

/** Applies a validated patch and flips onboarding_completed_at the first time everything is present. */
export async function applyProfilePatch(
  db: Db,
  userId: string,
  patch: ResolvedPatch,
): Promise<Profile> {
  return db.transaction(async (tx) => {
    await tx.query(
      `update profiles set
         name = coalesce($2, name),
         age = coalesce($3, age),
         city_key = coalesce($4, city_key), city_name = coalesce($5, city_name), city_timezone = coalesce($6, city_timezone),
         city_lat = coalesce($7, city_lat), city_lng = coalesce($8, city_lng),
         phone_e164 = coalesce($9, phone_e164),
         interests = coalesce($10, interests),
         onboarding_answers = coalesce($11::jsonb, onboarding_answers)
       where id = $1`,
      [
        userId,
        patch.name ?? null,
        patch.age ?? null,
        patch.city?.key ?? null,
        patch.city?.name ?? null,
        patch.city?.timezone ?? null,
        patch.city?.lat ?? null,
        patch.city?.lng ?? null,
        patch.phone ?? null,
        patch.interests ?? null,
        patch.answers ? JSON.stringify(patch.answers) : null,
      ],
    )
    const profile = (await loadProfile(tx, userId))!
    const fields = {
      ...profile,
      hasCity: profile.city !== null,
      answerCount: profile.answers.length,
    }
    if (profile.onboardingCompletedAt === null && isOnboardingComplete(fields)) {
      await tx.query('update profiles set onboarding_completed_at = now() where id = $1', [userId])
      return (await loadProfile(tx, userId))!
    }
    return profile
  })
}
