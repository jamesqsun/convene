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
    return <p className="p-6 text-center text-sm text-stone-500">Loading…</p>
  }
  return <>{children}</>
}
