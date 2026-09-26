/** E.164 after stripping the separators people type; no ownership verification. */
export const phonePattern = /^\+[1-9]\d{6,14}$/

export function normalizePhone(input: string): string | null {
  const stripped = input.replace(/[\s().-]/g, '')
  return phonePattern.test(stripped) ? stripped : null
}
