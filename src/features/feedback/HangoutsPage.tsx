'use client'

import { useState } from 'react'
import { useAppState } from '@/features/state/useAppState'
import { ApiError, apiFetch } from '@/lib/client-api'
import { formatDateTime } from '@/lib/format'
import { PersonFeedback } from './PersonFeedback'

export function HangoutsPage() {
  const { state, refresh } = useAppState()
  const [message, setMessage] = useState<string | null>(null)
  if (!state) return null

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
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Past hangouts</h1>
      <p className="text-sm text-stone-600">
        For each person: would you want to meet them again? Answers are private and final. When two
        people both say yes, they become friends.
      </p>
      {message && <p className="text-sm text-red-700">{message}</p>}
      {state.hangouts.length === 0 && (
        <p className="text-sm text-stone-500">Nothing completed yet.</p>
      )}
      {state.hangouts.map((hangout) => (
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
    </section>
  )
}
