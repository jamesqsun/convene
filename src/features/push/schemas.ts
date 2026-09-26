import { z } from 'zod'

/** The browser's PushSubscription as JSON. */
export const subscriptionInputSchema = z
  .object({
    endpoint: z.url().max(2048),
    keys: z
      .object({ p256dh: z.string().min(1).max(512), auth: z.string().min(1).max(512) })
      .strict(),
    expirationTime: z.number().nullable().optional(),
  })
  .strict()

export const unsubscribeInputSchema = z.object({ endpoint: z.url().max(2048) }).strict()

export type SubscriptionInput = z.infer<typeof subscriptionInputSchema>
