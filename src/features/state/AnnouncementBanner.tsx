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
      className="mx-4 mt-3 flex items-center justify-between gap-3 rounded-xl bg-emerald-600 px-4 py-3 text-sm text-white shadow"
    >
      <span>
        New plan assigned.{' '}
        <Link href={`/plans/${latest}`} className="font-semibold underline">
          See the details
        </Link>
      </span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="rounded-full px-2 text-lg leading-none"
      >
        ×
      </button>
    </div>
  )
}
