'use client'

import type { HangoutPerson } from '@/features/events/read'

export interface PersonFeedbackProps {
  person: HangoutPerson
  onAnswer: (answer: 'yes' | 'no') => void
}

/** "Would you want to meet this person again?" Locks after an answer; shows only the mutual outcome. */
export function PersonFeedback({ person, onAnswer }: PersonFeedbackProps) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg bg-white p-3">
      <div>
        <p className="font-medium">{person.name}</p>
        {person.isMutualFriend && (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-900">
            Mutual friends
          </span>
        )}
      </div>
      {person.myAnswer === null ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onAnswer('yes')}
            className="rounded-lg bg-stone-900 px-3 py-1 text-sm text-white"
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => onAnswer('no')}
            className="rounded-lg border border-stone-300 px-3 py-1 text-sm"
          >
            No
          </button>
        </div>
      ) : (
        <p className="text-sm text-stone-600">You answered {person.myAnswer}</p>
      )}
    </li>
  )
}
