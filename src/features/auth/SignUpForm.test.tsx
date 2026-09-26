import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SignUpForm } from './SignUpForm'

describe('SignUpForm', () => {
  it('renders the credentials form', () => {
    const html = renderToStaticMarkup(<SignUpForm />)
    expect(html).toContain('minLength="8"')
    expect(html).toContain('href="/sign-in"')
  })
})
