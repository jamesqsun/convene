/**
 * Which plan ids are new since the previous poll. The first load never announces anything, so a
 * returning user is not greeted with every existing plan as "new".
 */
export function newPlanIds(
  previous: readonly string[] | null,
  current: readonly string[],
): string[] {
  if (previous === null) return []
  const seen = new Set(previous)
  return current.filter((id) => !seen.has(id))
}
