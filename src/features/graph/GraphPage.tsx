'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/client-api'
import { formatDaysAgo } from '@/lib/format'
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
    <section className="space-y-5">
      <h1 className="text-[26px] leading-tight md:text-[34px]">Your connections</h1>
      {error && <p className="text-sm font-semibold text-clay-deep">{error}</p>}
      {graph === null && !error && <p className="hint">Loading…</p>}
      {graph?.nodes.length === 0 && (
        <div className="card text-center">
          <p className="font-extrabold">No mutual friends yet.</p>
          <p className="hint mt-1">
            After a hangout, say you would meet someone again. If they say yes too, they appear
            here.
          </p>
        </div>
      )}
      {graph && graph.nodes.length > 0 && (
        <div className="grid items-start gap-4 md:grid-cols-2">
          <div className="card flex justify-center px-2 py-6">
            <GraphSvg nodes={graph.nodes} now={graph.serverNow} />
          </div>
          <ul className="flex flex-col gap-3">
            {graph.nodes.map((node) => (
              <li key={node.userId} className="card flex items-center justify-between gap-3">
                <p className="font-extrabold">{node.name}</p>
                <p className="hint text-right">
                  {node.meetings} {node.meetings === 1 ? 'hangout' : 'hangouts'} ·{' '}
                  {formatDaysAgo(node.lastMetAt, graph.serverNow)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
