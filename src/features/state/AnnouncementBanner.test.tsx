import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AnnouncementBanner } from './AnnouncementBanner'

describe('AnnouncementBanner', () => {
  it('renders nothing without announcements and links to the newest plan', () => {
    expect(
      renderToStaticMarkup(<AnnouncementBanner planIds={[]} onDismiss={() => undefined} />),
    ).toBe('')
    const html = renderToStaticMarkup(
      <AnnouncementBanner planIds={['a', 'b']} onDismiss={() => undefined} />,
    )
    expect(html).toContain('href="/plans/b"')
    expect(html).toContain('New plan assigned')
  })
})
