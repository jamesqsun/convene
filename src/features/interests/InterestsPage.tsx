'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/client-api'
import type { InterestPrompt } from './store'

export function InterestCard({
  prompt,
  busy,
  onAnswer,
}: {
  prompt: InterestPrompt
  busy: boolean
  onAnswer: (answer: 'yes' | 'no') => void
}) {
  return (
    <article className="space-y-3 rounded-xl border border-stone-200 p-4">
      <p className="font-medium whitespace-pre-wrap">{prompt.text}</p>
      <p className="text-sm">Are you interested in this?</p>
      <p className="text-xs text-stone-600">
        Your answer is private and helps personalize future plans.
      </p>
      {prompt.answer === null ? (
        <div className="flex gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => onAnswer('yes')}
            className="rounded-lg bg-stone-900 px-4 py-2 text-white disabled:opacity-50"
          >
            Yes
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onAnswer('no')}
            className="rounded-lg border border-stone-400 px-4 py-2 disabled:opacity-50"
          >
            No
          </button>
        </div>
      ) : (
        <div className="space-y-2 text-sm">
          <p>You answered {prompt.answer === 'yes' ? 'Yes' : 'No'}.</p>
          <p role="status">
            {prompt.memoriesUpdated
              ? 'Your memories are updated.'
              : prompt.failed
                ? 'Your answer is saved, but we could not update your memories.'
                : 'Answer saved. Updating your memories in the background—you can leave this page.'}
          </p>
          {prompt.failed && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onAnswer(prompt.answer!)}
              className="underline"
            >
              Retry memory update
            </button>
          )}
        </div>
      )}
      {busy && (
        <p role="status" className="text-sm">
          Saving…
        </p>
      )}
    </article>
  )
}

export function InterestsPage({ promptId }: { promptId?: string }) {
  const [prompts, setPrompts] = useState<InterestPrompt[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const load = useCallback(async () => {
    try {
      const result = await apiFetch<{ prompt?: InterestPrompt; prompts?: InterestPrompt[] }>(
        promptId ? `/api/interests/${encodeURIComponent(promptId)}` : '/api/interests',
      )
      setPrompts(result.prompt ? [result.prompt] : (result.prompts ?? []))
      setError(null)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not load topics')
    }
  }, [promptId])
  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => {
    if (!prompts?.some((prompt) => prompt.answer && !prompt.memoriesUpdated && !prompt.failed))
      return
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, 5000)
    return () => clearInterval(timer)
  }, [prompts, load])
  async function answer(prompt: InterestPrompt, value: 'yes' | 'no') {
    if (busy) return
    setBusy(prompt.id)
    setError(null)
    try {
      const result = await apiFetch<{ prompt: InterestPrompt }>(`/api/interests/${prompt.id}`, {
        method: 'POST',
        body: { answer: value },
      })
      setPrompts(
        (existing) =>
          existing?.map((entry) => (entry.id === prompt.id ? result.prompt : entry)) ?? [
            result.prompt,
          ],
      )
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save your answer')
    } finally {
      setBusy(null)
    }
  }
  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Interest check-ins</h1>
      <a href={promptId ? '/interests' : '/profile'} className="text-sm underline">
        {promptId ? 'All check-ins' : 'Back to profile'}
      </a>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {!prompts && !error && <p>Loading…</p>}
      {prompts?.length === 0 && <p className="text-sm text-stone-600">No check-ins yet.</p>}
      {prompts?.map((prompt) => (
        <InterestCard
          key={prompt.id}
          prompt={prompt}
          busy={busy !== null}
          onAnswer={(value) => void answer(prompt, value)}
        />
      ))}
    </section>
  )
}
