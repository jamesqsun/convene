'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { useAppState } from '@/features/state/useAppState'

const onboardingPath = '/onboarding'

/** Sends signed-out visitors to sign-in and unfinished profiles to onboarding, client-side. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { state, error, isLoading } = useAppState()
  const pathname = usePathname() ?? ''
  const isOnboardingRoute = pathname.startsWith(onboardingPath)
  const needsOnboarding =
    state !== null && state.profile.onboardingStep !== 'done' && !isOnboardingRoute

  useEffect(() => {
    if (error?.status === 401) window.location.replace('/sign-in')
    else if (needsOnboarding) window.location.replace(onboardingPath)
  }, [error, needsOnboarding])

  if (isLoading || !state || needsOnboarding) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-sm font-semibold text-muted">
        <span className="mark animate-pulse" aria-hidden="true" />
        <p>Loading…</p>
      </div>
    )
  }
  return <>{children}</>
}
