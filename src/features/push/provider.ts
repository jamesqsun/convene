/** The push delivery surface: one device subscription in, one delivery outcome out. */

export interface PushSubscriptionRecord {
  endpoint: string
  p256dh: string
  auth: string
}

export type PushOutcome =
  | { status: 'sent'; statusCode: number }
  /** The push service says the subscription no longer exists (404/410); retire it. */
  | { status: 'gone'; statusCode: number }
  | { status: 'failed'; statusCode: number | null; error: string }

export interface PushSender {
  readonly kind: 'web_push' | 'fake'
  send(subscription: PushSubscriptionRecord, payload: string): Promise<PushOutcome>
}
