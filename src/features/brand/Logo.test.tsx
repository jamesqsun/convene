import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Logo, LogoMark } from './Logo'
import { logoArc } from './logo-mark'

describe('Logo', () => {
  it('is decorative by default and labelled when titled', () => {
    expect(renderToStaticMarkup(<LogoMark />)).toContain('aria-hidden="true"')
    const titled = renderToStaticMarkup(<LogoMark title="Convene" />)
    expect(titled).toContain('role="img"')
    expect(titled).toContain('aria-label="Convene"')
  })

  it('pairs the shared mark with the wordmark', () => {
    const html = renderToStaticMarkup(<Logo />)
    expect(html).toContain(logoArc)
    expect(html).toContain('Convene')
  })
})
