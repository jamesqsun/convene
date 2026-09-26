import type { PushOutcome, PushSender, PushSubscriptionRecord } from './provider'

export interface FakePushSender extends PushSender {
  /** Every delivery attempted, oldest first. */
  readonly sent: { endpoint: string; payload: string }[]
  /** Scripted outcomes per endpoint for tests; anything unscripted is a 201. */
  readonly outcomes: Map<string, PushOutcome>
}

/** Demo-mode sender: records and logs instead of contacting a push service. */
export function fakePushSender(isLogging = false): FakePushSender {
  const sent: { endpoint: string; payload: string }[] = []
  const outcomes = new Map<string, PushOutcome>()
  return {
    kind: 'fake',
    sent,
    outcomes,
    async send(subscription: PushSubscriptionRecord, payload: string): Promise<PushOutcome> {
      sent.push({ endpoint: subscription.endpoint, payload })
      if (isLogging) console.info(`[push:fake] ${subscription.endpoint} <- ${payload}`)
      return outcomes.get(subscription.endpoint) ?? { status: 'sent', statusCode: 201 }
    },
  }
}
