import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { day } from '@/lib/time'
import { GraphSvg } from './GraphSvg'

describe('GraphSvg', () => {
  it('draws friends solid and bright, others dashed and faded', () => {
    const now = Date.UTC(2026, 9, 1)
    const nodes = [
      {
        userId: 'f',
        name: 'Friend',
        interests: [],
        isFriend: true,
        meetings: 2,
        lastMetAt: now - 2 * day,
      },
      {
        userId: 'a',
        name: 'Acq',
        interests: [],
        isFriend: false,
        meetings: 1,
        lastMetAt: now - 200 * day,
      },
    ]
    const html = renderToStaticMarkup(<GraphSvg nodes={nodes} now={now} />)
    expect(html).toContain('stroke-dasharray="4 4"')
    expect(html).toContain('stroke-opacity="0.25"')
    expect(html).toContain('Friend')
    expect(html).toContain('200 days ago')
    expect(html).toContain('>You<')
  })
})
