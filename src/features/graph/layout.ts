/** Positions for a ring of nodes around a centre, deterministic in input order. */
export interface Point {
  x: number
  y: number
}

export function ringLayout(count: number, centre: Point, radius: number): Point[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * index) / Math.max(count, 1)
    return { x: centre.x + radius * Math.cos(angle), y: centre.y + radius * Math.sin(angle) }
  })
}
