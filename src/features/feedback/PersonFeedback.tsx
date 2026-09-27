'use client'

import type { HangoutPerson } from '@/features/events/read'

export interface PersonFeedbackProps {
  person: HangoutPerson
  onAnswer: (answer: 'yes' | 'no') => void
}

/** "Would you want to meet this person again?" Locks after an answer; shows only the mutual outcome. */
export function PersonFeedback({ person, onAnswer }: PersonFeedbackProps) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-2xl bg-linen p-3">
      <div>
        <p className="font-extrabold">{person.name}</p>
        {person.isMutualFriend && <span className="pill pill-sage mt-1">Mutual friends</span>}
      </div>
      {person.myAnswer === null ? (
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={() => onAnswer('yes')} className="btn btn-primary btn-sm">
            Yes
          </button>
          <button type="button" onClick={() => onAnswer('no')} className="btn btn-outline btn-sm">
            No
          </button>
        </div>
      ) : (
        <p className="hint shrink-0">You answered {person.myAnswer}</p>
      )}
    </li>
  )
}
