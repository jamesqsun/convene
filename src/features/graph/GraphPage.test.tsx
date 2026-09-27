import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { GraphPage } from './GraphPage'

describe('GraphPage', () => {
  it('titles the page and loads', () => {
    const html = renderToStaticMarkup(<GraphPage />)
    expect(html).toContain('Your connections')
    expect(html).not.toContain('never disappear')
    expect(html).toContain('Loading')
  })
})
