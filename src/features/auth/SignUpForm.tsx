'use client'

import { useState } from 'react'
import { ApiError, apiFetch } from '@/lib/client-api'
import { GoogleSignInLink } from './GoogleSignInLink'

export function SignUpForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)

  async function submit() {
    setIsBusy(true)
    setError(null)
    try {
      const result = await apiFetch<{ isEmailConfirmationPending: boolean }>('/api/auth/sign-up', {
        method: 'POST',
        body: { email, password },
      })
      if (result.isEmailConfirmationPending) {
        setNotice('Check your email to confirm your account, then sign in.')
        setIsBusy(false)
        return
      }
      window.location.assign('/onboarding')
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not create the account')
      setIsBusy(false)
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <h2 className="text-[26px]">Create an account</h2>
      <label className="field-label">
        Email
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="field"
        />
      </label>
      <label className="field-label">
        Password (8+ characters)
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="field"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm font-semibold text-clay-deep">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-xl bg-soft px-3 py-2 text-sm font-semibold text-sage-deep">
          {notice}
        </p>
      )}
      <button type="submit" disabled={isBusy} className="btn btn-primary w-full">
        Create account
      </button>
      <GoogleSignInLink />
      <p className="text-sm text-muted">
        Already have one?{' '}
        <a href="/sign-in" className="link">
          Sign in
        </a>
      </p>
    </form>
  )
}
