import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PushBanner } from './PushBanner'

describe('PushBanner', () => {
  it('renders nothing until the browser has been inspected', () => {
    expect(renderToStaticMarkup(<PushBanner />)).toBe('')
  })
})
