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
      className="mt-4 space-y-2 border-t border-line pt-3"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <label htmlFor={`event-feedback-${eventId}`} className="field-label">
        How was the hangout?
      </label>
      <p className="hint">
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
        className="field mt-0"
      />
      {feedback?.memoriesUpdated ? (
        <p className="hint">Feedback saved. Your memories are up to date.</p>
      ) : !feedback || feedback.memoryUpdateFailed ? (
        <button
          type="submit"
          disabled={busy || (!feedback && !text.trim())}
          className="btn btn-primary btn-sm"
        >
          {busy ? 'Saving…' : feedback ? 'Retry memory update' : 'Submit event feedback'}
        </button>
      ) : null}
      {feedback && !feedback.memoriesUpdated && (
        <p role="status" className="hint">
          {feedback.memoryUpdateFailed
            ? 'Feedback saved. We could not update your memories; please retry.'
            : 'Feedback saved. Your memories are updating in the background—you can leave this page.'}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm font-semibold text-ink/85">
          {message}
        </p>
      )}
    </form>
  )
}
