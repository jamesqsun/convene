'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/client-api'
import { GraphSvg } from './GraphSvg'
import type { GraphNode } from './read'

export function GraphPage() {
  const [graph, setGraph] = useState<{ serverNow: number; nodes: GraphNode[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<{ serverNow: number; nodes: GraphNode[] }>('/api/graph')
      .then(setGraph)
      .catch(() => setError('Could not load your connections'))
  }, [])

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Your connections</h1>
      <p className="text-sm text-stone-600">
        Mutual friends from completed Convene hangouts. Lines fade with time since your last Convene
        hangout together; they never disappear.
      </p>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {graph === null && !error && <p className="text-sm text-stone-500">Loading…</p>}
      {graph?.nodes.length === 0 && (
        <p className="text-sm text-stone-500">No mutual friends yet.</p>
      )}
      {graph && graph.nodes.length > 0 && <GraphSvg nodes={graph.nodes} now={graph.serverNow} />}
    </section>
  )
}
