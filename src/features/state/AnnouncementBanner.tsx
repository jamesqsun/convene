'use client'

import Link from 'next/link'

export interface AnnouncementBannerProps {
  planIds: string[]
  onDismiss: () => void
}

/** Shown when a poll reveals a plan that was not there before. */
export function AnnouncementBanner({ planIds, onDismiss }: AnnouncementBannerProps) {
  if (planIds.length === 0) return null
  const latest = planIds[planIds.length - 1]!
  return (
    <div
      role="status"
      className="mx-4 mt-3 flex items-center justify-between gap-3 rounded-2xl border border-sage/40 bg-soft px-3.5 py-3 text-sm font-bold text-sage-deep"
    >
      <span>
        New plan assigned.{' '}
        <Link
          href={`/plans/${latest}`}
          className="font-extrabold underline decoration-sage/50 underline-offset-2 hover:decoration-sage"
        >
          See the details
        </Link>
      </span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="rounded-full px-2 text-xl leading-none hover:bg-sage/15"
      >
        ×
      </button>
    </div>
  )
}
