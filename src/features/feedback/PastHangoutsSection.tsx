'use client'

import { useState } from 'react'
import type { Hangout } from '@/features/events/read'
import { useAppState } from '@/features/state/useAppState'
import { ApiError, apiFetch } from '@/lib/client-api'
import { formatDateTime } from '@/lib/format'
import { PersonFeedback } from './PersonFeedback'

const initialCount = 3

/** A short list of completed hangouts at the bottom of Plans, not a whole tab of its own. */
export function PastHangoutsSection({ hangouts }: { hangouts: Hangout[] }) {
  const { refresh } = useAppState()
  const [message, setMessage] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  if (hangouts.length === 0) return null
  const visible = showAll ? hangouts : hangouts.slice(0, initialCount)
  const remaining = hangouts.length - visible.length

  async function answer(eventId: string, subjectUserId: string, value: 'yes' | 'no') {
    setMessage(null)
    try {
      await apiFetch('/api/feedback', {
        method: 'POST',
        body: { eventId, subjectUserId, answer: value },
      })
      await refresh()
    } catch (caught) {
      setMessage(caught instanceof ApiError ? caught.message : 'Could not save your answer')
    }
  }

  return (
    <section className="space-y-3 border-t border-stone-200 pt-4">
      <h2 className="text-sm font-semibold text-stone-600">Past hangouts</h2>
      {message && <p className="text-sm text-red-700">{message}</p>}
      <div className="space-y-3">
        {visible.map((hangout) => (
          <article key={hangout.eventId} className="rounded-xl border border-stone-200 p-4">
            <p className="font-semibold">{hangout.activityName}</p>
            <p className="text-sm text-stone-600">
              {formatDateTime(hangout.endedAt, hangout.timezone)} · {hangout.venueName}
            </p>
            <ul className="mt-3 space-y-2">
              {hangout.people.map((person) => (
                <PersonFeedback
                  key={person.userId}
                  person={person}
                  onAnswer={(value) => void answer(hangout.eventId, person.userId, value)}
                />
              ))}
            </ul>
          </article>
        ))}
      </div>
      {remaining > 0 && (
        <button type="button" onClick={() => setShowAll(true)} className="text-sm underline">
          Show {remaining} more
        </button>
      )}
      {remaining === 0 && hangouts.length > initialCount && (
        <button type="button" onClick={() => setShowAll(false)} className="text-sm underline">
          Show fewer
        </button>
      )}
    </section>
  )
}
