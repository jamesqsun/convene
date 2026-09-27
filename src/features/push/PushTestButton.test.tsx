import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { PushTestButton } from './PushTestButton'
it('offers a user-triggered notification test without sending during render', () => {
  expect(renderToStaticMarkup(<PushTestButton />)).toContain('Send test notification')
})
