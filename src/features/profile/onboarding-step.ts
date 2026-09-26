import { onboardingPrompts } from './schemas'

export type OnboardingStep = 'basics' | 'city' | 'phone' | 'interests' | 'answers' | 'done'

export interface OnboardingFields {
  name: string
  age: number | null
  hasCity: boolean
  phone: string | null
  interests: string[]
  answerCount: number
  onboardingCompletedAt: number | null
}

/** Derived from what is saved, so a refresh resumes at the right step without any stored cursor. */
export function onboardingStepFor(fields: OnboardingFields): OnboardingStep {
  if (fields.onboardingCompletedAt !== null) return 'done'
  if (fields.name === '' || fields.age === null) return 'basics'
  if (!fields.hasCity) return 'city'
  if (fields.phone === null) return 'phone'
  if (fields.interests.length === 0) return 'interests'
  if (fields.answerCount < onboardingPrompts.length) return 'answers'
  return 'done'
}

export function isOnboardingComplete(fields: OnboardingFields): boolean {
  return onboardingStepFor({ ...fields, onboardingCompletedAt: null }) === 'done'
}
