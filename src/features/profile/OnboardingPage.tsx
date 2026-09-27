'use client'

import { useEffect, useState } from 'react'
import { LogoMark } from '@/features/brand/Logo'
import { Spinner } from '@/features/shell/Spinner'
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

  if (!profile) {
    if (error) return <p className="mx-auto max-w-xl text-sm text-clay-deep md:pt-6">{error}</p>
    return <OnboardingSkeleton />
  }
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
  if (result === null || result === 'pending') return <BuildingMemories />
  if (result.status === 'ok')
    return (
      <p role="status" className="flex items-center gap-2 font-bold text-sage-deep">
        <Spinner />
        Done. Taking you to your availability.
      </p>
    )
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

/** The page's shape in soft placeholders while the profile loads, so nothing jumps in later. */
export function OnboardingSkeleton() {
  return (
    <section className="mx-auto max-w-xl" aria-busy="true">
      <p className="sr-only" role="status">
        Loading…
      </p>
      <div aria-hidden="true" className="motion-safe:animate-pulse">
        <div className="flex justify-between gap-1.5 md:justify-start md:gap-7">
          {stepperSteps.map(({ step }) => (
            <div key={step} className="flex flex-col items-center gap-1 md:flex-row md:gap-2">
              <span className="size-6 rounded-full bg-line" />
              <span className="h-2.5 w-10 rounded-full bg-line" />
            </div>
          ))}
        </div>
        <div className="mt-7 h-2.5 w-20 rounded-full bg-line md:mt-9" />
        <div className="mt-3 h-8 w-3/4 rounded-xl bg-line" />
        <div className="mt-7 h-3 w-24 rounded-full bg-line" />
        <div className="mt-2 h-11 rounded-xl bg-surface ring-1 ring-line" />
        <div className="mt-5 h-3 w-16 rounded-full bg-line" />
        <div className="mt-2 h-11 rounded-xl bg-surface ring-1 ring-line" />
        <div className="mt-6 h-11 rounded-[14px] bg-sage/30" />
      </div>
    </section>
  )
}

const buildingSteps = [
  'Reading your answers',
  'Noticing what you enjoy',
  'Writing your memories',
  'Almost there',
]

/**
 * Shown while memories are generated, which can take several seconds: a breathing mark, an
 * indeterminate bar, and a status line that walks through the work. Only the heading is
 * announced; the rotating line is decorative.
 */
export function BuildingMemories() {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    const timer = setInterval(
      () => setIndex((current) => Math.min(current + 1, buildingSteps.length - 1)),
      2600,
    )
    return () => clearInterval(timer)
  }, [])
  return (
    <div className="card flex flex-col items-center px-6 py-10 text-center">
      <div aria-hidden="true" className="relative grid size-20 place-items-center">
        <span className="absolute inset-0 rounded-full bg-sage/25 motion-safe:animate-ping" />
        <span className="absolute inset-3 rounded-full bg-soft" />
        <LogoMark className="relative size-10 text-sage-deep motion-safe:animate-pulse" />
      </div>
      <p role="status" className="mt-6 font-display text-lg font-semibold text-ink">
        Turning your answers into memories…
      </p>
      <p
        aria-hidden="true"
        key={index}
        className="onboarding-fade mt-1.5 text-sm font-semibold text-muted"
      >
        {buildingSteps[index]}…
      </p>
      <div
        aria-hidden="true"
        className="mt-6 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-soft"
      >
        <div className="onboarding-bar h-full w-1/3 rounded-full bg-sage" />
      </div>
      <p className="hint mt-5">This usually takes a few seconds.</p>
    </div>
  )
}
