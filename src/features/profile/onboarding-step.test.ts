import { describe, expect, it } from 'vitest'
import { type OnboardingFields, isOnboardingComplete, onboardingStepFor } from './onboarding-step'

const complete: OnboardingFields = {
  name: 'Maya',
  age: 30,
  hasCity: true,
  phone: '+14165550100',
  interests: ['coffee'],
  answerCount: 3,
  onboardingCompletedAt: null,
}

describe('onboardingStepFor', () => {
  it('walks the steps in order', () => {
    expect(onboardingStepFor({ ...complete, name: '' })).toBe('basics')
    expect(onboardingStepFor({ ...complete, age: null })).toBe('basics')
    expect(onboardingStepFor({ ...complete, hasCity: false })).toBe('city')
    expect(onboardingStepFor({ ...complete, phone: null })).toBe('phone')
    expect(onboardingStepFor({ ...complete, interests: [] })).toBe('interests')
    expect(onboardingStepFor({ ...complete, answerCount: 2 })).toBe('answers')
    expect(onboardingStepFor(complete)).toBe('done')
    expect(isOnboardingComplete(complete)).toBe(true)
    expect(isOnboardingComplete({ ...complete, phone: null })).toBe(false)
  })

  it('treats a completed profile as done even if fields were later cleared', () => {
    expect(onboardingStepFor({ ...complete, interests: [], onboardingCompletedAt: 1 })).toBe('done')
  })
})
