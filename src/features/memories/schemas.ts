import { z } from 'zod'
import { attributeKeyPattern } from '@/features/ai/schemas'

export const maxAttributes = 20

export const attributesSchema = z
  .record(
    z.string().regex(attributeKeyPattern, 'Attribute keys are lowercase snake_case'),
    z.string().trim().min(1).max(200),
  )
  .refine(
    (attributes) => Object.keys(attributes).length <= maxAttributes,
    `At most ${maxAttributes} attributes`,
  )

/** Owner edits: title (topic), summary, or the whole attribute map. Evidence is never editable. */
export const memoryPatchSchema = z
  .object({
    topic: z.string().trim().min(1).max(80).optional(),
    summary: z.string().trim().min(1).max(500).optional(),
    attributes: attributesSchema.optional(),
  })
  .strict()
  .refine(
    (patch) =>
      patch.topic !== undefined || patch.summary !== undefined || patch.attributes !== undefined,
    'Nothing to change',
  )

export type MemoryPatch = z.infer<typeof memoryPatchSchema>
