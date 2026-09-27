'use client'

import { useEffect, useState } from 'react'
import { ApiError, apiFetch } from '@/lib/client-api'
import { GoogleSignInLink, googleSignInError } from './GoogleSignInLink'

interface Persona {
  email: string
  name: string
  cityLabel: string | null
}

/** Email and password sign-in; in demo mode also one-tap persona chips. */
export function SignInForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [personas, setPersonas] = useState<Persona[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)

  useEffect(() => {
    apiFetch<{ personas: Persona[] }>('/api/auth/demo-personas')
      .then((body) => setPersonas(body.personas))
      .catch(() => setPersonas([]))
  }, [])

  useEffect(() => {
    setError(googleSignInError(window.location.search))
  }, [])

  async function signIn(asEmail: string, asPassword: string) {
    setIsBusy(true)
    setError(null)
    try {
      await apiFetch('/api/auth/sign-in', {
        method: 'POST',
        body: { email: asEmail, password: asPassword },
      })
      window.location.assign('/availability')
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not sign in')
      setIsBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-[26px]">Sign in</h2>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          void signIn(email, password)
        }}
      >
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
          Password
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
        <button type="submit" disabled={isBusy} className="btn btn-primary w-full">
          Sign in
        </button>
      </form>
      <GoogleSignInLink />
      {personas.length > 0 && (
        <section>
          <h3 className="eyebrow font-sans">Demo personas</h3>
          <p className="hint mt-0.5">Fictional people. Tap one to explore as them.</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {personas.map((persona) => (
              <li key={persona.email}>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void signIn(persona.email, 'demo-password')}
                  className="chip disabled:opacity-50"
                >
                  {persona.name}
                  {persona.cityLabel ? ` · ${persona.cityLabel}` : ''}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-sm text-muted">
        New here?{' '}
        <a href="/sign-up" className="link">
          Create an account
        </a>
      </p>
    </div>
  )
}
