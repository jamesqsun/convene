import { apiFetch } from '@/lib/client-api'

/** Browser side of web push: service worker registration, permission, and subscription sync. */

export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(normalized)
  return Uint8Array.from(raw, (char) => char.charCodeAt(0))
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
}

/** Subscribes this device (after permission) and records it on the server. */
export async function subscribeThisDevice(): Promise<
  'subscribed' | 'denied' | 'unavailable' | 'not-configured'
> {
  if (!isPushSupported()) return 'unavailable'
  // iOS requires this call directly from the button tap, before any network await.
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'denied'
  const { publicKey } = await apiFetch<{ publicKey: string | null }>('/api/push/public-key')
  if (!publicKey) return 'not-configured'
  await registerServiceWorker()
  const registration = await navigator.serviceWorker.ready
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    }))
  await apiFetch('/api/push/subscriptions', { method: 'POST', body: subscription.toJSON() })
  return 'subscribed'
}

/** Keeps the server's copy fresh for devices that already granted permission. */
export async function syncExistingSubscription(): Promise<boolean> {
  await registerServiceWorker()
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (subscription)
    await apiFetch('/api/push/subscriptions', { method: 'POST', body: subscription.toJSON() })
  return subscription !== null
}
