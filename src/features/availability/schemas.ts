import { z } from 'zod'

/**
 * A slot is a date plus a start and end clock time in the owner's city time zone. That is the
 * whole scheduling input: no activity, budget, group size, platform, mode, or radius.
 */
export const slotInputSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM'),
    endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM'),
  })
  .strict()

export type SlotInput = z.infer<typeof slotInputSchema>
