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

const stepperSteps: { step: OnboardingStep; label: string }[] = [
  { step: 'basics', label: 'Basics' },
  { step: 'city', label: 'City' },
  { step: 'phone', label: 'Phone' },
  { step: 'interests', label: 'Interests' },
  { step: 'answers', label: 'Answers' },
]

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

  if (!profile)
    return <p className="mx-auto max-w-xl text-sm text-muted md:pt-6">{error ?? 'Loading…'}</p>
  const step = profile.onboardingStep
  const index = stepperSteps.findIndex((s) => s.step === step)
  const current = index === -1 ? stepperSteps.length : index
  return (
    <section className="mx-auto max-w-xl">
      <Stepper current={current} />
      {current < stepperSteps.length && (
        <p className="eyebrow mt-6 md:mt-8">
          Step {current + 1} of {stepperSteps.length}
        </p>
      )}
      <h1
        className={`text-[26px] leading-tight md:text-[34px] ${current < stepperSteps.length ? 'mt-1' : 'mt-6 md:mt-8'}`}
      >
        {stepTitles[step]}
      </h1>
      {error && <p className="mt-2 text-sm text-clay-deep">{error}</p>}
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

/** Numbered progress: done steps in sage, the current one in deep sage, upcoming ones neutral. */
function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex justify-between gap-1.5 md:justify-start md:gap-7">
      {stepperSteps.map(({ step, label }, i) => (
        <li
          key={step}
          aria-current={i === current ? 'step' : undefined}
          className={`flex flex-col items-center gap-1 text-[10px] font-extrabold md:flex-row md:gap-2 md:text-[13px] ${i === current ? 'text-ink' : 'text-muted'}`}
        >
          <span
            className={`grid size-6 place-items-center rounded-full text-[11px] ${i < current ? 'bg-sage text-white' : i === current ? 'bg-sage-deep text-white' : 'bg-line text-muted'}`}
          >
            {i + 1}
          </span>
          {label}
        </li>
      ))}
    </ol>
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
    return <p className="text-muted">Turning your answers into memories…</p>
  if (result.status === 'ok')
    return <p className="font-bold text-sage-deep">Done. Taking you to your availability.</p>
  return (
    <div className="space-y-3 rounded-2xl bg-clay-soft p-4">
      <p className="text-sm font-bold text-clay-deep">{result.notice}</p>
      <div className="flex gap-2">
        <button type="button" onClick={onRetry} className="btn btn-primary btn-sm">
          Retry
        </button>
        <a href="/availability" className="btn btn-outline btn-sm">
          Continue anyway
        </a>
      </div>
    </div>
  )
}
