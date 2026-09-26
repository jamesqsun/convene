import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { GraphPage } from './GraphPage'

describe('GraphPage', () => {
  it('explains the fading and loads', () => {
    const html = renderToStaticMarkup(<GraphPage />)
    expect(html).toContain('never disappear')
    expect(html).toContain('Loading')
  })
})
