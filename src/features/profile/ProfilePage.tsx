'use client'

import { useEffect, useState } from 'react'
import { MemoryCard } from '@/features/memories/MemoryCard'
import { MemoryEditor } from '@/features/memories/MemoryEditor'
import type { Memory } from '@/features/memories/store'
import { useAppState } from '@/features/state/useAppState'
import { ApiError, apiFetch } from '@/lib/client-api'

/** The profile is the memory sketch: generated memories with owner-only Edit and Delete. */
export function ProfilePage() {
  const { state, refresh } = useAppState()
  const [memories, setMemories] = useState<Memory[] | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = () =>
    apiFetch<{ memories: Memory[] }>('/api/memories')
      .then((body) => setMemories(body.memories))
      .catch(() => setError('Could not load memories'))

  useEffect(() => {
    void load()
  }, [])

  async function saveEdit(
    memory: Memory,
    patch: { topic: string; summary: string; attributes: Record<string, string> },
  ) {
    await apiFetch(`/api/memories/${memory.id}`, { method: 'PATCH', body: patch })
    setEditingId(null)
    await load()
  }

  async function remove(memory: Memory) {
    if (
      !window.confirm(
        `Delete the memory "${memory.topic}"? A later generation may recreate it from your answers.`,
      )
    )
      return
    try {
      await apiFetch(`/api/memories/${memory.id}`, { method: 'DELETE' })
      await Promise.all([load(), refresh()])
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not delete')
    }
  }

  async function signOut() {
    await apiFetch('/api/auth/sign-out', { method: 'POST' }).catch(() => undefined)
    window.location.assign('/sign-in')
  }

  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-[26px] leading-tight md:text-[34px]">{state?.profile.name}</h1>
        <p className="hint mt-1 text-sm">{state?.profile.cityLabel ?? 'No city yet'}</p>
      </header>
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-[13px] font-bold">
        <a href="/profile/answers" className="link">
          Your answers and regeneration
        </a>
        <button
          type="button"
          onClick={() => void signOut()}
          className="text-ink underline decoration-line underline-offset-2 hover:decoration-sage"
        >
          Sign out
        </button>
      </div>
      <h2 className="pt-2 text-[19px]">What Convene remembers</h2>
      {error && <p className="text-sm text-clay-deep">{error}</p>}
      {memories === null && <p className="text-sm text-muted">Loading…</p>}
      {memories?.length === 0 && (
        <p className="text-sm text-muted">
          No memories yet. Answer the questions on the answers page to generate them.
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-2 md:items-start md:gap-[18px]">
        {memories?.map((memory) =>
          editingId === memory.id ? (
            <MemoryEditor
              key={memory.id}
              memory={memory}
              onSave={(patch) => saveEdit(memory, patch)}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <MemoryCard
              key={memory.id}
              memory={memory}
              onEdit={() => setEditingId(memory.id)}
              onDelete={() => void remove(memory)}
            />
          ),
        )}
      </div>
    </section>
  )
}
