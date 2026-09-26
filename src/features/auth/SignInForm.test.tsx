import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SignInForm } from './SignInForm'

describe('SignInForm', () => {
  it('renders email and password fields and a sign-up link', () => {
    const html = renderToStaticMarkup(<SignInForm />)
    expect(html).toContain('type="email"')
    expect(html).toContain('type="password"')
    expect(html).toContain('href="/sign-up"')
  })
})
