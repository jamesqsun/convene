import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BottomNav, isActivePath, navItems } from './BottomNav'

describe('BottomNav', () => {
  it('renders every primary destination', () => {
    const html = renderToStaticMarkup(<BottomNav />)
    for (const item of navItems) expect(html).toContain(`href="${item.href}"`)
    expect(navItems.map((item) => item.label)).not.toContain('Connections')
  })

  it('treats nested routes as active but not look-alike prefixes', () => {
    expect(isActivePath('/plans/abc', '/plans')).toBe(true)
    expect(isActivePath('/plans', '/plans')).toBe(true)
    expect(isActivePath('/plansx', '/plans')).toBe(false)
  })
})
