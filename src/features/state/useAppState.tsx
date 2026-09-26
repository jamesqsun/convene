'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, apiFetch } from '@/lib/client-api'
import { newPlanIds } from './announcements'
import type { AppState } from './read'

/**
 * The client-side source of truth. Polls /api/state every 30 seconds while the tab is visible,
 * refreshes on demand after mutations, and tracks plan ids so newly assigned plans can be announced.
 */

export const pollIntervalMs = 30_000

export type ClientState = AppState & { mode: 'demo' | 'supabase' }

export interface AppStateValue {
  state: ClientState | null
  error: ApiError | null
  isLoading: boolean
  announcedPlanIds: string[]
  refresh: () => Promise<void>
  dismissAnnouncements: () => void
}

export const AppStateContext = createContext<AppStateValue | null>(null)

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ClientState | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [announcedPlanIds, setAnnouncedPlanIds] = useState<string[]>([])
  const previousPlanIds = useRef<string[] | null>(null)

  const refresh = useCallback(async () => {
    try {
      const next = await apiFetch<ClientState>('/api/state')
      const currentIds = next.plans
        .filter((plan) => plan.status === 'scheduled')
        .map((plan) => plan.eventId)
      const fresh = newPlanIds(previousPlanIds.current, currentIds)
      previousPlanIds.current = currentIds
      if (fresh.length > 0) setAnnouncedPlanIds((existing) => [...existing, ...fresh])
      setState(next)
      setError(null)
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught
          : new ApiError(0, 'network', 'Could not reach the server'),
      )
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const tick = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    const interval = setInterval(tick, pollIntervalMs)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [refresh])

  const value = useMemo<AppStateValue>(
    () => ({
      state,
      error,
      isLoading,
      announcedPlanIds,
      refresh,
      dismissAnnouncements: () => setAnnouncedPlanIds([]),
    }),
    [state, error, isLoading, announcedPlanIds, refresh],
  )
  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}

export function useAppState(): AppStateValue {
  const value = useContext(AppStateContext)
  if (!value) throw new Error('useAppState must be used inside AppStateProvider')
  return value
}
