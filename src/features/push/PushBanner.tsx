'use client'

import { useEffect, useState } from 'react'
import { isPushSupported, subscribeThisDevice, syncExistingSubscription } from './client'

type Status = 'hidden' | 'prompt' | 'denied' | 'unavailable' | 'not-configured' | 'error'

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
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!isPushSupported()) return
    if (Notification.permission === 'granted') {
      syncExistingSubscription()
        .then((subscribed) => {
          if (!subscribed) setStatus('prompt')
        })
        .catch(() => setStatus('error'))
      return
    }
    if (Notification.permission === 'denied') setStatus('denied')
    else if (!readDismissed()) setStatus('prompt')
  }, [])

  async function enable() {
    if (busy) return
    setBusy(true)
    try {
      const result = await subscribeThisDevice()
      setStatus(result === 'subscribed' ? 'hidden' : result)
    } catch (error) {
      console.error('[push] subscription failed:', error)
      setStatus('error')
    } finally {
      setBusy(false)
    }
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
        This browser does not support push. On iPhone, open Convene from its Home Screen icon on iOS
        16.4 or later.
      </p>
    )
  }
  if (status === 'not-configured' || status === 'error') {
    return (
      <div
        role="status"
        className="mx-4 mt-3 rounded-2xl border border-line bg-surface px-3.5 py-2.5 text-xs text-muted"
      >
        <p>
          {status === 'not-configured'
            ? 'Notifications are not configured on the server yet.'
            : 'Could not enable notifications. Check your connection and try again.'}
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void enable()}
          className="link mt-2 disabled:opacity-50"
        >
          {busy ? 'Enabling…' : 'Try again'}
        </button>
      </div>
    )
  }
  return (
    <div className="mx-4 mt-3 flex items-center justify-between gap-3 rounded-2xl bg-sage-deep px-3.5 py-3 text-sm font-bold text-surface">
      <span>Get a notification when a plan is assigned.</span>
      <span className="flex shrink-0 gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void enable()}
          className="btn btn-sm bg-surface text-ink hover:bg-linen"
        >
          {busy ? 'Enabling…' : 'Enable'}
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
