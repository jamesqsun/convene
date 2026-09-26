'use client'

import { useEffect, useState } from 'react'
import { ApiError, apiFetch } from '@/lib/client-api'

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
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          void signIn(email, password)
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
          Password
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
        <button
          type="submit"
          disabled={isBusy}
          className="w-full rounded-lg bg-stone-900 px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          Sign in
        </button>
      </form>
      {personas.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-stone-600">Demo personas</h2>
          <p className="text-xs text-stone-500">Fictional people. Tap one to explore as them.</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {personas.map((persona) => (
              <li key={persona.email}>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void signIn(persona.email, 'demo-password')}
                  className="rounded-full border border-stone-300 px-3 py-1 text-sm"
                >
                  {persona.name}
                  {persona.cityLabel ? ` · ${persona.cityLabel}` : ''}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-sm text-stone-600">
        New here?{' '}
        <a href="/sign-up" className="font-medium underline">
          Create an account
        </a>
      </p>
    </div>
  )
}
