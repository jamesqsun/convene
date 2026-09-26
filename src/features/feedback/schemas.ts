import { z } from 'zod'

/** One directional answer: "Would you want to meet this person again?" */
export const feedbackInputSchema = z
  .object({
    eventId: z.uuid(),
    subjectUserId: z.uuid(),
    answer: z.enum(['yes', 'no']),
  })
  .strict()

export type FeedbackInput = z.infer<typeof feedbackInputSchema>
