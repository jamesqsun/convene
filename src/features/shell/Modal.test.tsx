import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Modal } from './Modal'

describe('Modal', () => {
  it('renders nothing when closed and its content when open', () => {
    expect(
      renderToStaticMarkup(<Modal isOpen={false} onClose={() => undefined} ariaLabel="Details" />),
    ).toBe('')
    const html = renderToStaticMarkup(
      <Modal isOpen onClose={() => undefined} ariaLabel="Details">
        <p>Inside the modal</p>
      </Modal>,
    )
    expect(html).toContain('Inside the modal')
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-label="Details"')
  })
})
