const errorMessages: Record<string, string> = {
  google_failed: 'Google sign-in did not complete. Try again.',
  google_unavailable: 'Google sign-in is not available here. Use email and password.',
}

/** The message for the `error` code the Google routes put in the sign-in page's query string. */
export function googleSignInError(search: string): string | null {
  const code = new URLSearchParams(search).get('error')
  if (!code || !Object.hasOwn(errorMessages, code)) return null
  return errorMessages[code] ?? null
}

/** A plain link: the server route answers with a redirect to Google's consent screen. */
export function GoogleSignInLink() {
  return (
    <a href="/api/auth/google" className="btn btn-outline w-full">
      Continue with Google
    </a>
  )
}
