import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { day } from '@/lib/time'
import { GraphSvg, driftFor } from './GraphSvg'

describe('GraphSvg', () => {
  it('draws recent friends bright and old friends faded', () => {
    const now = Date.UTC(2026, 9, 1)
    const nodes = [
      {
        userId: 'f',
        name: 'Friend',
        interests: [],
        meetings: 2,
        lastMetAt: now - 2 * day,
      },
      {
        userId: 'a',
        name: 'Old friend',
        interests: [],
        meetings: 1,
        lastMetAt: now - 200 * day,
      },
    ]
    const html = renderToStaticMarkup(<GraphSvg nodes={nodes} now={now} />)
    expect(html).not.toContain('stroke-dasharray')
    expect(html).toContain('stroke-opacity="0.25"')
    expect(html).toContain('Friend')
    expect(html).toContain('200 days ago')
    expect(html).toContain('>You<')
  })

  it('staggers each friend and gives it its own drift', () => {
    const now = Date.UTC(2026, 9, 1)
    const node = { userId: 'f', name: 'F', interests: [], meetings: 1, lastMetAt: now }
    const html = renderToStaticMarkup(
      <GraphSvg nodes={[node, { ...node, userId: 'g' }]} now={now} />,
    )
    expect(html).toContain('--i:1')
    expect(html).toContain('graph-pulse')
    expect(driftFor(0)).not.toEqual(driftFor(1))
    for (let index = 0; index < 12; index++) {
      const { x, y } = driftFor(index)
      expect(Math.hypot(parseFloat(x), parseFloat(y))).toBeLessThan(18)
    }
  })
})
