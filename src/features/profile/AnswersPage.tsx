'use client'

import { useEffect, useState } from 'react'
import { ApiError, apiFetch } from '@/lib/client-api'
import { AnswersStep } from './OnboardingSteps'
import type { Profile } from './store'

/** Raw answers are owner-only. Regeneration preserves memories learned from event feedback. */
export function AnswersPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<{ profile: Profile }>('/api/profile')
      .then((body) => setProfile(body.profile))
      .catch(() => setMessage('Could not load your answers'))
  }, [])

  async function save(patch: { answers: { promptId: string; text: string }[] }) {
    try {
      const body = await apiFetch<{ profile: Profile }>('/api/profile', {
        method: 'PATCH',
        body: patch,
      })
      setProfile(body.profile)
      setMessage('Answers saved. Regenerate memories to apply them.')
    } catch (caught) {
      setMessage(caught instanceof ApiError ? caught.message : 'Could not save')
    }
  }

  async function regenerate() {
    if (
      !window.confirm(
        'Regenerating replaces memories from your profile answers, including ones you edited. Memories from event feedback are kept. Continue?',
      )
    )
      return
    setMessage('Regenerating…')
    const result = await apiFetch<{ status: string; notice: string | null }>(
      '/api/memories/generate',
      { method: 'POST' },
    ).catch(() => ({ status: 'failed', notice: 'Could not regenerate' }))
    setMessage(result.status === 'ok' ? 'Memories regenerated.' : result.notice)
  }

  if (!profile) return <p className="text-sm text-stone-500">{message ?? 'Loading…'}</p>
  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Your answers</h1>
      <p className="text-sm text-stone-600">
        Only you can see these. They are never shown to other participants or used in plan
        explanations.
      </p>
      <AnswersStep
        initial={{ answers: profile.answers }}
        onSave={save}
        submitLabel="Save answers"
      />
      <button
        type="button"
        onClick={() => void regenerate()}
        className="w-full rounded-lg border border-stone-300 px-4 py-2 text-sm"
      >
        Regenerate memories from these answers
      </button>
      {message && <p className="text-sm text-stone-700">{message}</p>}
      <a href="/profile" className="block text-sm underline">
        Back to profile
      </a>
    </section>
  )
}
