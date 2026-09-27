import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Spinner, SubmitButton } from './Spinner'

describe('Spinner', () => {
  it('is decorative', () => {
    expect(renderToStaticMarkup(<Spinner />)).toContain('aria-hidden="true"')
  })

  it('swaps the label and disables the button while busy', () => {
    const idle = renderToStaticMarkup(
      <SubmitButton isBusy={false} busyLabel="Saving…">
        Continue
      </SubmitButton>,
    )
    expect(idle).toContain('Continue')
    expect(idle).not.toContain('disabled')
    const busy = renderToStaticMarkup(
      <SubmitButton isBusy busyLabel="Saving…">
        Continue
      </SubmitButton>,
    )
    expect(busy).toContain('Saving…')
    expect(busy).toContain('disabled')
    expect(busy).toContain('aria-busy="true"')
    expect(busy).toContain('animate-spin')
  })
})
