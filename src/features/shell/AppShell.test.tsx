import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AppShell } from './AppShell'

describe('AppShell', () => {
  it('renders a loading state on the server before any data arrives', () => {
    const html = renderToStaticMarkup(
      <AppShell>
        <p>content</p>
      </AppShell>,
    )
    expect(html).toContain('Loading')
    expect(html).not.toContain('content')
  })
})
