'use client'

import { AuthGate } from '@/features/auth/AuthGate'
import { PushBanner } from '@/features/push/PushBanner'
import { AnnouncementBanner } from '@/features/state/AnnouncementBanner'
import { AppStateProvider, useAppState } from '@/features/state/useAppState'
import { BottomNav } from './BottomNav'

function ShellBody({ children }: { children: React.ReactNode }) {
  const { announcedPlanIds, dismissAnnouncements } = useAppState()
  return (
    <div className="mx-auto min-h-screen max-w-lg pb-20">
      <AnnouncementBanner planIds={announcedPlanIds} onDismiss={dismissAnnouncements} />
      <PushBanner />
      <main className="px-4 pt-4">{children}</main>
      <BottomNav />
    </div>
  )
}

/** Wraps every signed-in page: state polling, auth redirects, banners, and the bottom nav. */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AppStateProvider>
      <AuthGate>
        <ShellBody>{children}</ShellBody>
      </AuthGate>
    </AppStateProvider>
  )
}
