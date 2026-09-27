'use client'

import { useState } from 'react'
import { apiFetch } from '@/lib/client-api'
import { subscribeThisDevice } from './client'

export function PushTestButton() {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  async function test() {
    if (busy) return
    setBusy(true)
    setMessage(null)
    try {
      const result = await subscribeThisDevice()
      if (result !== 'subscribed') {
        setMessage(
          result === 'not-configured'
            ? 'Notifications are not configured on this server.'
            : result === 'denied'
              ? 'Allow notifications for Convene in your phone settings.'
              : 'Open Convene from its Home Screen icon in a browser that supports push.',
        )
        return
      }
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (!subscription) throw new Error('No push subscription on this device.')
      const response = await apiFetch<{ statusCode: number }>('/api/push/test', {
        method: 'POST',
        body: { endpoint: subscription.endpoint },
      })
      setMessage(
        `Push service accepted the test (HTTP ${response.statusCode}). If no alert appears, check Notification Center, Focus, and Convene’s notification settings.`,
      )
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not send a test notification.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => void test()}
        className="link text-sm disabled:opacity-50"
      >
        {busy ? 'Sending test…' : 'Send test notification'}
      </button>
      {message && (
        <p role="status" className="text-sm text-muted">
          {message}
        </p>
      )}
    </div>
  )
}
