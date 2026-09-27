'use client'

import { usePathname } from 'next/navigation'
import { AuthGate } from '@/features/auth/AuthGate'
import { PushBanner } from '@/features/push/PushBanner'
import { AnnouncementBanner } from '@/features/state/AnnouncementBanner'
import { AppStateProvider, useAppState } from '@/features/state/useAppState'
import { BottomNav } from './BottomNav'
import { SideNav } from './SideNav'

function ShellBody({ children }: { children: React.ReactNode }) {
  const { announcedPlanIds, dismissAnnouncements } = useAppState()
  // Onboarding has no navigation, so it gets the full width instead of a sidebar column.
  const hasNav = !(usePathname() ?? '').startsWith('/onboarding')
  return (
    <div className={`min-h-screen ${hasNav ? 'md:grid md:grid-cols-[230px_minmax(0,1fr)]' : ''}`}>
      <SideNav />
      <div className="mx-auto w-full max-w-lg pb-24 md:max-w-3xl md:px-8 md:pb-12">
        <AnnouncementBanner planIds={announcedPlanIds} onDismiss={dismissAnnouncements} />
        <PushBanner />
        <main className="px-4 pt-5 md:pt-10">{children}</main>
      </div>
      <BottomNav />
    </div>
  )
}

/** Wraps every signed-in page: state polling, auth redirects, banners, and navigation. */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AppStateProvider>
      <AuthGate>
        <ShellBody>{children}</ShellBody>
      </AuthGate>
    </AppStateProvider>
  )
}
