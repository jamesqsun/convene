import { z } from 'zod'

/**
 * Two schemas per model call: a loose "model" schema handed to Meta structured outputs (strict
 * JSON schema mode rejects length and range keywords) and a strict application schema the parsed
 * result must pass before anything is stored. Model output is a proposal, never trusted as-is.
 */

const attributeModelSchema = z.object({ key: z.string(), value: z.string() }).strict()

export const memoryExtractionModelSchema = z
  .object({
    memories: z.array(
      z
        .object({
          topic: z.string(),
          summary: z.string(),
          evidence: z.array(z.string()),
          attributes: z.array(attributeModelSchema),
          confidence: z.number(),
        })
        .strict(),
    ),
  })
  .strict()

export const attributeKeyPattern = /^[a-z][a-z0-9_]{0,39}$/

export const memoryDraftSchema = z
  .object({
    topic: z.string().trim().min(1).max(80),
    summary: z.string().trim().min(1).max(500),
    evidence: z.array(z.string().trim().min(1).max(300)).min(1).max(5),
    attributes: z
      .array(
        z
          .object({
            key: z.string().regex(attributeKeyPattern),
            value: z.string().trim().min(1).max(200),
          })
          .strict(),
      )
      .max(12),
    confidence: z.number().min(0).max(1),
  })
  .strict()

export const memoryExtractionSchema = z
  .object({ memories: z.array(memoryDraftSchema).max(8) })
  .strict()

export type MemoryDraft = z.infer<typeof memoryDraftSchema>
export type MemoryExtraction = z.infer<typeof memoryExtractionSchema>

export const rankingModelSchema = z
  .object({
    ranked: z.array(z.object({ activityId: z.string(), durationMinutes: z.number() }).strict()),
    rationale: z.string(),
  })
  .strict()

/** Attributes travel as key/value pairs (structured-output friendly) and are stored as an object. */
export function attributesToObject(
  pairs: readonly { key: string; value: string }[],
): Record<string, string> {
  return Object.fromEntries(pairs.map((pair) => [pair.key, pair.value]))
}
