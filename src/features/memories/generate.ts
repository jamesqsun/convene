import type { AiProvider } from '@/features/ai/provider'
import { onboardingPrompts } from '@/features/profile/schemas'
import { loadProfile } from '@/features/profile/store'
import type { Db } from '@/lib/db'
import { refreshDerived } from './derived'
import { keepSupported } from './evidence'
import { type Memory, listMemories, memoryText, replaceMemories } from './store'
import { attributesToObject } from '@/features/ai/schemas'

export interface GenerateResult {
  status: 'ok' | 'failed'
  notice: string | null
  memories: Memory[]
}

/**
 * Builds the owner's memory sketch from their saved answers. Any provider failure leaves the
 * answers saved and existing memories untouched, and returns a notice for the UI. A later run
 * may recreate a memory the owner deleted; that is by design for the MVP.
 */
export async function generateMemories(
  db: Db,
  ai: AiProvider,
  userId: string,
): Promise<GenerateResult> {
  const profile = await loadProfile(db, userId)
  if (!profile || profile.answers.length === 0) {
    return { status: 'failed', notice: 'Answer the onboarding questions first.', memories: [] }
  }
  const promptText = new Map(onboardingPrompts.map((prompt) => [prompt.id, prompt.text]))
  const answers = profile.answers.map((answer) => ({
    prompt: promptText.get(answer.promptId) ?? answer.promptId,
    text: answer.text,
  }))
  try {
    const extraction = await ai.extractMemories({ interests: profile.interests, answers })
    const drafts = keepSupported(
      extraction.memories,
      answers.map((answer) => answer.text),
    )
    const embeddings = await ai.embed(
      drafts.map((draft) =>
        memoryText({
          topic: draft.topic,
          summary: draft.summary,
          attributes: attributesToObject(draft.attributes),
        }),
      ),
    )
    await replaceMemories(db, userId, drafts, embeddings)
    await refreshDerived(db, ai, userId)
    return { status: 'ok', notice: null, memories: await listMemories(db, userId) }
  } catch (error) {
    console.error('[memories] generation failed:', error)
    return {
      status: 'failed',
      notice:
        'We saved your answers but could not build your memory sketch yet. You can retry from your profile.',
      memories: await listMemories(db, userId),
    }
  }
}
