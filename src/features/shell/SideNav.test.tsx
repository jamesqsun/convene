import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { navItems } from './BottomNav'
import { SideNav } from './SideNav'

describe('SideNav', () => {
  it('renders the brand and every primary destination', () => {
    const html = renderToStaticMarkup(<SideNav />)
    expect(html).toContain('Convene')
    for (const item of navItems) expect(html).toContain(`href="${item.href}"`)
  })
})
