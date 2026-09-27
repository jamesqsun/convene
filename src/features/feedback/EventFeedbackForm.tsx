'use client'

import { useEffect, useState } from 'react'
import type { EventFeedback } from './event'
import { apiFetch, ApiError } from '@/lib/client-api'
import { useAppState } from '@/features/state/useAppState'

export function EventFeedbackForm({
  eventId,
  saved,
}: {
  eventId: string
  saved?: EventFeedback | null
}) {
  const { refresh } = useAppState()
  const [text, setText] = useState(saved?.text ?? '')
  const [submitted, setSubmitted] = useState<EventFeedback | null>(null)
  const feedback = submitted ?? saved
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  // Let polled server state replace the immediate submission acknowledgement.
  useEffect(() => {
    setSubmitted(null)
  }, [saved])

  async function submit() {
    if (busy) return
    setBusy(true)
    setMessage(null)
    try {
      const result = await apiFetch<{ feedback: EventFeedback; notice: string | null }>(
        '/api/feedback/event',
        {
          method: 'POST',
          body: { eventId, text: feedback?.text ?? text.trim() },
        },
      )
      setSubmitted(result.feedback)
      setMessage(result.notice)
      void refresh()
    } catch (error) {
      setMessage(
        error instanceof ApiError ? error.message : 'Could not submit feedback. Please retry.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="mt-4 space-y-2 border-t border-stone-200 pt-3"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <label htmlFor={`event-feedback-${eventId}`} className="block text-sm font-semibold">
        How was the hangout?
      </label>
      <p className="text-xs text-stone-600">
        What did you enjoy, and what would you change next time? This is private and helps update
        your preference memories.
      </p>
      <textarea
        id={`event-feedback-${eventId}`}
        value={feedback?.text ?? text}
        onChange={(event) => setText(event.target.value)}
        readOnly={!!feedback}
        disabled={busy}
        required
        maxLength={2000}
        rows={3}
        placeholder="I enjoyed the walk, but would prefer a quieter place to chat afterward."
        className="w-full rounded-lg border border-stone-300 p-2 text-sm"
      />
      {feedback?.memoriesUpdated ? (
        <p className="text-xs text-stone-600">Feedback saved. Your memories are up to date.</p>
      ) : !feedback || feedback.memoryUpdateFailed ? (
        <button
          type="submit"
          disabled={busy || (!feedback && !text.trim())}
          className="rounded-lg bg-stone-900 px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          {busy ? 'Saving…' : feedback ? 'Retry memory update' : 'Submit event feedback'}
        </button>
      ) : null}
      {feedback && !feedback.memoriesUpdated && (
        <p role="status" className="text-xs text-stone-600">
          {feedback.memoryUpdateFailed
            ? 'Feedback saved. We could not update your memories; please retry.'
            : 'Feedback saved. Your memories are updating in the background—you can leave this page.'}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm text-stone-700">
          {message}
        </p>
      )}
    </form>
  )
}
