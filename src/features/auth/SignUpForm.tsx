'use client'

import { useState } from 'react'
import { ApiError, apiFetch } from '@/lib/client-api'

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
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <label className="block text-sm">
        Email
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        Password (8+ characters)
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
        />
      </label>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
      <button
        type="submit"
        disabled={isBusy}
        className="w-full rounded-lg bg-stone-900 px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        Create account
      </button>
      <p className="text-sm text-stone-600">
        Already have one?{' '}
        <a href="/sign-in" className="font-medium underline">
          Sign in
        </a>
      </p>
    </form>
  )
}
