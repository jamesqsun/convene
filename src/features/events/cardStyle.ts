/** Deterministic, decorative styling for plan cards: no photos exist, so color stands in for one. */

const cardGradients = [
  'from-blue-100 to-indigo-100',
  'from-emerald-100 to-teal-100',
  'from-violet-100 to-fuchsia-100',
  'from-amber-100 to-orange-100',
  'from-rose-100 to-pink-100',
]

const avatarColors = [
  'bg-blue-600',
  'bg-emerald-600',
  'bg-violet-600',
  'bg-amber-600',
  'bg-rose-600',
  'bg-teal-600',
]

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
