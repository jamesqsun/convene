/** Deterministic, decorative styling for plan cards: no photos exist, so color stands in for one. */

// Sage & Linen washes only (DECISIONS.md "Sage & Linen visual style").
const cardGradients = [
  'from-soft to-linen',
  'from-linen via-soft/70 to-soft',
  'from-soft via-linen to-line/60',
  'from-sage/20 via-soft to-linen',
  'from-line/70 via-linen to-soft',
  'from-soft via-soft/60 to-clay-soft/50',
]

// Dark enough for white initials to pass WCAG AA.
const avatarColors = ['bg-sage-deep', 'bg-ink/80', 'bg-ink']

function hashOf(key: string): number {
  let hash = 0
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  return hash
}

export function gradientFor(key: string): string {
  return cardGradients[hashOf(key) % cardGradients.length]!
}

export function avatarColorFor(key: string): string {
  return avatarColors[hashOf(key) % avatarColors.length]!
}

export function initialOf(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?'
}
