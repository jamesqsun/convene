import { describe, expect, it } from 'vitest'
import { ringLayout } from './layout'

describe('ringLayout', () => {
  it('spaces nodes evenly starting from the top', () => {
    const points = ringLayout(4, { x: 0, y: 0 }, 10)
    expect(points.map((p) => [Math.round(p.x), Math.round(p.y)])).toEqual([
      [0, -10],
      [10, 0],
      [0, 10],
      [-10, 0],
    ])
    expect(ringLayout(0, { x: 0, y: 0 }, 10)).toEqual([])
  })
})
