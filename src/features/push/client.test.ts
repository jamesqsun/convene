import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isPushSupported,
  subscribeThisDevice,
  syncExistingSubscription,
  urlBase64ToUint8Array,
} from './client'

afterEach(() => vi.unstubAllGlobals())

function browser(publicKey: string | null = 'AQID') {
  const permission = vi.fn(async () => 'granted')
  const subscription = { toJSON: () => ({ endpoint: 'https://push.example/device' }) }
  const subscribe = vi.fn(async () => subscription)
  const registration = {
    pushManager: {
      subscribe,
      getSubscription: vi.fn(async () => null as typeof subscription | null),
    },
  }
  const serviceWorker = {
    register: vi.fn(async () => registration),
    ready: Promise.resolve(registration),
  }
  vi.stubGlobal('window', { PushManager: {}, Notification: {} })
  vi.stubGlobal('navigator', { serviceWorker })
  vi.stubGlobal('Notification', { requestPermission: permission })
  const fetch = vi.fn(async () => Response.json({ publicKey }))
  vi.stubGlobal('fetch', fetch)
  return { permission, subscription, subscribe, registration, serviceWorker, fetch }
}

it('requests permission synchronously from the tap and waits for an active worker', async () => {
  const mock = browser()
  let ready!: (registration: typeof mock.registration) => void
  mock.serviceWorker.ready = new Promise((resolve) => {
    ready = resolve
  })
  const result = subscribeThisDevice()
  expect(mock.permission).toHaveBeenCalledTimes(1)
  expect(mock.fetch).not.toHaveBeenCalled()
  await vi.waitFor(() => expect(mock.serviceWorker.register).toHaveBeenCalled())
  expect(mock.subscribe).not.toHaveBeenCalled()
  ready(mock.registration)
  expect(await result).toBe('subscribed')
  expect(mock.fetch).toHaveBeenLastCalledWith(
    '/api/push/subscriptions',
    expect.objectContaining({ method: 'POST' }),
  )
})

it('distinguishes missing server configuration and allows recovery after permission was granted', async () => {
  const mock = browser(null)
  expect(await subscribeThisDevice()).toBe('not-configured')
  expect(mock.subscribe).not.toHaveBeenCalled()
  expect(await syncExistingSubscription()).toBe(false)
  mock.registration.pushManager.getSubscription.mockResolvedValue(mock.subscription)
  expect(await syncExistingSubscription()).toBe(true)
})

it('does not subscribe when denied and preserves actual service errors', async () => {
  const mock = browser()
  mock.permission.mockResolvedValue('denied')
  expect(await subscribeThisDevice()).toBe('denied')
  expect(mock.fetch).not.toHaveBeenCalled()
  mock.permission.mockResolvedValue('granted')
  mock.subscribe.mockRejectedValue(new Error('push service failed'))
  await expect(subscribeThisDevice()).rejects.toThrow('push service failed')
})

describe('push client helpers', () => {
  it('decodes url-safe base64 VAPID keys', () => {
    expect(Array.from(urlBase64ToUint8Array('AQID'))).toEqual([1, 2, 3])
    expect(Array.from(urlBase64ToUint8Array('-_8'))).toEqual([251, 255])
  })

  it('reports push as unsupported outside a browser', () => {
    expect(isPushSupported()).toBe(false)
  })
})
