'use client'

import { useEffect, useState } from 'react'
import { isPushSupported, subscribeThisDevice, syncExistingSubscription } from './client'

type Status = 'hidden' | 'prompt' | 'denied' | 'unavailable'

const dismissedKey = 'convene.pushDismissedAt'

function readDismissed(): boolean {
  try {
    return localStorage.getItem(dismissedKey) !== null
  } catch {
    return false
  }
}

/**
 * Asks once for push permission. Granted devices are re-synced silently; denied or unsupported
 * browsers get a one-line explanation. In-app plan status never depends on this.
 */
export function PushBanner() {
  const [status, setStatus] = useState<Status>('hidden')

  useEffect(() => {
    if (!isPushSupported()) return
    if (Notification.permission === 'granted') {
      syncExistingSubscription().catch(() => undefined)
      return
    }
    if (Notification.permission === 'denied') setStatus('denied')
    else if (!readDismissed()) setStatus('prompt')
  }, [])

  async function enable() {
    const result = await subscribeThisDevice().catch(() => 'unavailable' as const)
    setStatus(result === 'subscribed' ? 'hidden' : result)
  }

  function dismiss() {
    try {
      localStorage.setItem(dismissedKey, String(Date.now()))
    } catch {
      // Private mode: the banner simply reappears next visit.
    }
    setStatus('hidden')
  }

  if (status === 'hidden') return null
  if (status === 'denied') {
    return (
      <p className="mx-4 mt-3 rounded-2xl border border-line bg-surface px-3.5 py-2.5 text-xs text-muted">
        Notifications are blocked in this browser; plan updates still appear here.
      </p>
    )
  }
  if (status === 'unavailable') {
    return (
      <p className="mx-4 mt-3 rounded-2xl border border-line bg-surface px-3.5 py-2.5 text-xs text-muted">
        Push is not available on this device (on iPhone, add Convene to your Home Screen first).
      </p>
    )
  }
  return (
    <div className="mx-4 mt-3 flex items-center justify-between gap-3 rounded-2xl bg-sage-deep px-3.5 py-3 text-sm font-bold text-surface">
      <span>Get a notification when a plan is assigned.</span>
      <span className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={() => void enable()}
          className="btn btn-sm bg-surface text-ink hover:bg-linen"
        >
          Enable
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="btn btn-sm text-surface/80 hover:text-surface"
        >
          Later
        </button>
      </span>
    </div>
  )
}
