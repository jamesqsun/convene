'use client'

import { useEffect, useState } from 'react'
import { ApiError, apiFetch } from '@/lib/client-api'
import { AnswersStep, BasicsStep, CityStep, InterestsStep, PhoneStep } from './OnboardingSteps'
import type { OnboardingStep } from './onboarding-step'
import type { Profile } from './store'

type ProfileView = Profile & { onboardingStep: OnboardingStep }

interface GenerateResult {
  status: 'ok' | 'failed'
  notice: string | null
}

const stepTitles: Record<OnboardingStep, string> = {
  basics: 'Let us get to know you',
  city: 'Where are you?',
  phone: 'How can plans reach you?',
  interests: 'What are you into?',
  answers: 'A few questions',
  done: 'Building your memory sketch',
}

/** Resumable onboarding: the server derives the current step from what has been saved. */
export function OnboardingPage() {
  const [profile, setProfile] = useState<ProfileView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [generation, setGeneration] = useState<GenerateResult | 'pending' | null>(null)

  useEffect(() => {
    apiFetch<{ profile: ProfileView }>('/api/profile')
      .then((body) => setProfile(body.profile))
      .catch((caught: unknown) => {
        if (caught instanceof ApiError && caught.status === 401) window.location.replace('/sign-in')
        else setError('Could not load your profile')
      })
  }, [])

  useEffect(() => {
    if (profile?.onboardingStep === 'done' && profile.memoryCount === 0 && generation === null)
      void generate()
  })

  async function save(patch: Record<string, unknown>) {
    setError(null)
    try {
      const body = await apiFetch<{ profile: ProfileView }>('/api/profile', {
        method: 'PATCH',
        body: patch,
      })
      setProfile(body.profile)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not save')
    }
  }

  async function generate() {
    setGeneration('pending')
    try {
      const result = await apiFetch<GenerateResult>('/api/memories/generate', { method: 'POST' })
      setGeneration(result)
      if (result.status === 'ok') window.location.assign('/availability')
    } catch {
      setGeneration({
        status: 'failed',
        notice: 'We saved your answers but could not build your memory sketch yet.',
      })
    }
  }

  if (!profile) return <p className="text-sm text-stone-500">{error ?? 'Loading…'}</p>
  const step = profile.onboardingStep
  return (
    <section>
      <h1 className="text-xl font-semibold">{stepTitles[step]}</h1>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      <div className="mt-4">
        {step === 'basics' && (
          <BasicsStep initial={{ name: profile.name, age: profile.age }} onSave={(p) => save(p)} />
        )}
        {step === 'city' && (
          <CityStep initial={{ city: null }} onSave={(p) => save({ cityKey: p.city?.key })} />
        )}
        {step === 'phone' && (
          <PhoneStep initial={{ phone: profile.phone ?? '' }} onSave={(p) => save(p)} />
        )}
        {step === 'interests' && (
          <InterestsStep initial={{ interests: profile.interests }} onSave={(p) => save(p)} />
        )}
        {step === 'answers' && (
          <AnswersStep initial={{ answers: profile.answers }} onSave={(p) => save(p)} />
        )}
        {step === 'done' && (
          <GenerationStatus result={generation} onRetry={() => void generate()} />
        )}
      </div>
    </section>
  )
}

function GenerationStatus({
  result,
  onRetry,
}: {
  result: GenerateResult | 'pending' | null
  onRetry: () => void
}) {
  if (result === null || result === 'pending')
    return <p className="text-sm text-stone-600">Turning your answers into memories…</p>
  if (result.status === 'ok')
    return <p className="text-sm text-emerald-700">Done. Taking you to your availability.</p>
  return (
    <div className="space-y-3">
      <p className="text-sm text-amber-800">{result.notice}</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg bg-stone-900 px-4 py-2 text-sm text-white"
        >
          Retry
        </button>
        <a href="/availability" className="rounded-lg border border-stone-300 px-4 py-2 text-sm">
          Continue anyway
        </a>
      </div>
    </div>
  )
}
