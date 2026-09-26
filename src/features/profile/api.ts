import {
  type SessionProvider,
  authed,
  authedMutation,
  sessionProvider,
} from '@/features/auth/session'
import { resolveCity } from '@/features/cities/search'
import { type Db, getDb } from '@/lib/db'
import { HttpError, type RouteHandler, jsonResponse, readJson } from '@/lib/http'
import { onboardingStepFor } from './onboarding-step'
import { normalizePhone } from './phone'
import { type ProfilePatch, onboardingPrompts, profilePatchSchema } from './schemas'
import { type Profile, type ResolvedPatch, applyProfilePatch, loadProfile } from './store'

export interface ProfileRouteDeps {
  getProvider: () => Promise<SessionProvider>
  getDatabase: () => Promise<Db>
}

/** The owner's full profile: private fields included, plus the derived onboarding step. */
export function profileResponse(profile: Profile) {
  return {
    ...profile,
    onboardingStep: onboardingStepFor({
      ...profile,
      hasCity: profile.city !== null,
      answerCount: profile.answers.length,
    }),
    prompts: onboardingPrompts,
  }
}

function resolvePatch(patch: ProfilePatch): ResolvedPatch {
  const { cityKey, phone, ...rest } = patch
  const resolved: ResolvedPatch = { ...rest }
  if (cityKey !== undefined) {
    const city = resolveCity(cityKey)
    if (!city) throw new HttpError(422, 'unknown_city', 'Pick a city from the suggestions')
    resolved.city = city
  }
  if (phone !== undefined) {
    const normalized = normalizePhone(phone)
    if (!normalized)
      throw new HttpError(400, 'invalid_phone', 'Enter an international number starting with +')
    resolved.phone = normalized
  }
  return resolved
}

export function profileRoutes(deps: ProfileRouteDeps): { get: RouteHandler; patch: RouteHandler } {
  return {
    get: authed(async (_request, userId) => {
      const profile = await loadProfile(await deps.getDatabase(), userId)
      if (!profile) throw new HttpError(404, 'profile_missing', 'Profile not found')
      return jsonResponse({ profile: profileResponse(profile) })
    }, deps.getProvider),
    patch: authedMutation(async (request, userId) => {
      const patch = resolvePatch(await readJson(request, profilePatchSchema))
      const profile = await applyProfilePatch(await deps.getDatabase(), userId, patch)
      return jsonResponse({ profile: profileResponse(profile) })
    }, deps.getProvider),
  }
}

const routes = profileRoutes({ getProvider: sessionProvider, getDatabase: getDb })
export const GET = routes.get
export const PATCH = routes.patch
