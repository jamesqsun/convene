import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { GoogleSignInLink, googleSignInError } from './GoogleSignInLink'

describe('GoogleSignInLink', () => {
  it('links to the server route that starts Google sign-in', () => {
    const html = renderToStaticMarkup(<GoogleSignInLink />)
    expect(html).toContain('href="/api/auth/google"')
    expect(html).toContain('Continue with Google')
  })

  it('explains known error codes and ignores everything else', () => {
    expect(googleSignInError('?error=google_failed')).toContain('did not complete')
    expect(googleSignInError('?error=google_unavailable')).toContain('not available')
    expect(googleSignInError('?error=<script>')).toBeNull()
    expect(googleSignInError('')).toBeNull()
  })
})
