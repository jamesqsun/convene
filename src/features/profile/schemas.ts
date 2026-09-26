import { z } from 'zod'
import { isInterest, maxInterests } from './interests'

/** The three written prompts. Answers are owner-only and feed memory generation. */
export const onboardingPrompts = [
  { id: 'weekend', text: 'What does a good weekend look like for you?' },
  {
    id: 'meeting_people',
    text: 'How do you like to meet new people, and what makes it feel comfortable?',
  },
  { id: 'try_new', text: 'What is something you would like to try with the right company?' },
] as const

export type PromptId = (typeof onboardingPrompts)[number]['id']

export const promptIds = onboardingPrompts.map((prompt) => prompt.id) as [PromptId, ...PromptId[]]

export const answerSchema = z
  .object({ promptId: z.enum(promptIds), text: z.string().trim().min(20).max(600) })
  .strict()

/**
 * Everything onboarding can save, all optional so it can be saved step by step. Strict: any
 * removed control (budget, activities, group size, platforms...) is rejected outright.
 */
export const profilePatchSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    age: z.number().int().min(18).max(120).optional(),
    cityKey: z.string().min(3).max(200).optional(),
    phone: z.string().trim().min(7).max(32).optional(),
    interests: z
      .array(z.string())
      .max(maxInterests)
      .refine((values) => values.every(isInterest), 'Unknown interest')
      .refine((values) => new Set(values).size === values.length, 'Duplicate interest')
      .optional(),
    answers: z
      .array(answerSchema)
      .max(onboardingPrompts.length)
      .refine(
        (values) => new Set(values.map((a) => a.promptId)).size === values.length,
        'Duplicate prompt',
      )
      .optional(),
    isRepeatingAvailability: z.boolean().optional(),
  })
  .strict()

export type ProfilePatch = z.infer<typeof profilePatchSchema>
export type Answer = z.infer<typeof answerSchema>
