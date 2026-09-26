import type { MemoryDraft } from '@/features/openai/schemas'

/**
 * Evidence must be verbatim. A generated memory keeps only evidence entries that appear in the
 * owner's answers (after whitespace and case normalization), and a memory with no surviving
 * evidence is dropped entirely. This is what stops the model inventing support for a claim.
 */

export function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

export function isSupported(evidence: string, answers: readonly string[]): boolean {
  const needle = normalizeText(evidence)
  return needle.length > 0 && answers.some((answer) => normalizeText(answer).includes(needle))
}

export function keepSupported(
  drafts: readonly MemoryDraft[],
  answers: readonly string[],
): MemoryDraft[] {
  const kept: MemoryDraft[] = []
  for (const draft of drafts) {
    const evidence = draft.evidence.filter((entry) => isSupported(entry, answers))
    if (evidence.length > 0) kept.push({ ...draft, evidence })
  }
  return kept
}
