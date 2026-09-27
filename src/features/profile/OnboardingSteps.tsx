'use client'

import { useState } from 'react'
import { type CityOption, CityPicker } from '@/features/cities/CityPicker'
import { interests as interestVocabulary, maxInterests } from './interests'
import { onboardingPrompts } from './schemas'

/** The individual onboarding steps. Each calls `onSave` with a profile patch and nothing else. */

export interface StepProps<Patch> {
  initial: Patch
  onSave: (patch: Patch) => Promise<void>
}

const inputClass = 'field'
const buttonClass = 'btn btn-primary mt-5 w-full'

export function BasicsStep({ initial, onSave }: StepProps<{ name: string; age: number | null }>) {
  const [name, setName] = useState(initial.name)
  const [age, setAge] = useState(initial.age?.toString() ?? '')
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void onSave({ name: name.trim(), age: Number(age) })
      }}
    >
      <label className="field-label">
        Your name
        <input
          required
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
      </label>
      <label className="field-label mt-3">
        Age
        <input
          required
          type="number"
          min={18}
          max={120}
          value={age}
          onChange={(e) => setAge(e.target.value)}
          className={inputClass}
        />
      </label>
      <button type="submit" className={buttonClass}>
        Continue
      </button>
    </form>
  )
}

export function CityStep({ initial, onSave }: StepProps<{ city: CityOption | null }>) {
  const [city, setCity] = useState<CityOption | null>(initial.city)
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (city) void onSave({ city })
      }}
    >
      <p className="mb-3 text-muted md:text-base">Plans are made with people in the same city.</p>
      <CityPicker value={city} onChange={setCity} />
      <button type="submit" disabled={!city} className={buttonClass}>
        Continue
      </button>
    </form>
  )
}

export function PhoneStep({ initial, onSave }: StepProps<{ phone: string }>) {
  const [phone, setPhone] = useState(initial.phone)
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void onSave({ phone: phone.trim() })
      }}
    >
      <label className="field-label">
        Phone number, with country code
        <input
          required
          type="tel"
          inputMode="tel"
          placeholder="+1 416 555 0100"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className={inputClass}
        />
      </label>
      <p className="hint mt-2">
        Shared only with the people in a plan you are assigned to, so you can coordinate on the day.
      </p>
      <button type="submit" className={buttonClass}>
        Continue
      </button>
    </form>
  )
}

export function InterestsStep({ initial, onSave }: StepProps<{ interests: string[] }>) {
  const [selected, setSelected] = useState<string[]>(initial.interests)
  const toggle = (interest: string) =>
    setSelected((current) =>
      current.includes(interest)
        ? current.filter((i) => i !== interest)
        : current.length < maxInterests
          ? [...current, interest]
          : current,
    )
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void onSave({ interests: selected })
      }}
    >
      <p className="mb-3 text-muted md:text-base">
        Pick up to {maxInterests}. These are the only details other participants see.
      </p>
      <ul className="flex flex-wrap gap-2">
        {interestVocabulary.map((interest) => (
          <li key={interest}>
            <button
              type="button"
              aria-pressed={selected.includes(interest)}
              onClick={() => toggle(interest)}
              className={`chip ${selected.includes(interest) ? 'chip-on' : ''}`}
            >
              {interest}
            </button>
          </li>
        ))}
      </ul>
      <p className="hint mt-3">{selected.length} selected</p>
      <button type="submit" disabled={selected.length === 0} className={buttonClass}>
        Continue
      </button>
    </form>
  )
}

export type AnswerDraft = { promptId: string; text: string }

export function AnswersStep({
  initial,
  onSave,
  submitLabel = 'Finish',
}: StepProps<{ answers: AnswerDraft[] }> & { submitLabel?: string }) {
  const [answers, setAnswers] = useState<Record<string, string>>(
    Object.fromEntries(initial.answers.map((a) => [a.promptId, a.text])),
  )
  const isComplete = onboardingPrompts.every(
    (prompt) => (answers[prompt.id] ?? '').trim().length >= 20,
  )
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void onSave({
          answers: onboardingPrompts.map((p) => ({
            promptId: p.id,
            text: (answers[p.id] ?? '').trim(),
          })),
        })
      }}
    >
      <p className="mb-1 text-muted md:text-base">
        A few sentences each. Only you can read these; Convene turns them into memories it uses to
        plan.
      </p>
      {onboardingPrompts.map((prompt) => (
        <label key={prompt.id} className="field-label mt-4">
          {prompt.text}
          <textarea
            required
            minLength={20}
            maxLength={600}
            rows={3}
            value={answers[prompt.id] ?? ''}
            onChange={(e) => setAnswers((current) => ({ ...current, [prompt.id]: e.target.value }))}
            className={inputClass}
          />
        </label>
      ))}
      <button type="submit" disabled={!isComplete} className={buttonClass}>
        {submitLabel}
      </button>
    </form>
  )
}
