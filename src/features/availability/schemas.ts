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

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/, 'HH:MM')

/** A week's availability as day-of-week windows; the server turns them into dated slots. */
export const weekInputSchema = z
  .object({
    windows: z
      .array(z.object({ day: z.number().int().min(0).max(6), start: clock, end: clock }).strict())
      .max(70),
  })
  .strict()

export type WeekInput = z.infer<typeof weekInputSchema>
