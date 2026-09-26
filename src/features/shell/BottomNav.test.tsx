import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BottomNav, navItems } from './BottomNav'

describe('BottomNav', () => {
  it('renders every primary destination', () => {
    const html = renderToStaticMarkup(<BottomNav />)
    for (const item of navItems) expect(html).toContain(`href="${item.href}"`)
    expect(navItems.map((item) => item.label)).not.toContain('Connections')
  })
})
