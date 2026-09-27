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

  if (!profile) return <p className="text-sm text-muted">{message ?? 'Loading…'}</p>
  return (
    <section className="space-y-4">
      <h1 className="text-[26px] leading-tight md:text-[34px]">Your answers</h1>
      <p className="text-muted md:text-base">
        Only you can see these. They are never shown to other participants or used in plan
        explanations.
      </p>
      <AnswersStep
        initial={{ answers: profile.answers }}
        onSave={save}
        submitLabel="Save answers"
      />
      <button type="button" onClick={() => void regenerate()} className="btn btn-ghost w-full">
        Regenerate memories from these answers
      </button>
      {message && <p className="text-sm text-ink/85">{message}</p>}
      <a href="/profile" className="link inline-block text-sm">
        Back to profile
      </a>
    </section>
  )
}
