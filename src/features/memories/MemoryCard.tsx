'use client'

import type { Memory } from './store'

export interface MemoryCardProps {
  memory: Memory
  onEdit: () => void
  onDelete: () => void
}

/** One generated memory: title, summary, attribute chips, and the owner's two controls. */
export function MemoryCard({ memory, onEdit, onDelete }: MemoryCardProps) {
  const attributes = Object.entries(memory.attributes)
  return (
    <article className="rounded-xl border border-stone-200 bg-white p-4">
      <header className="flex items-start justify-between gap-3">
        <h3 className="font-semibold capitalize">{memory.topic}</h3>
        {memory.editedAt !== null && <span className="text-xs text-stone-500">Edited by you</span>}
      </header>
      <p className="mt-1 text-sm text-stone-700">{memory.summary}</p>
      {attributes.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1">
          {attributes.map(([key, value]) => (
            <li key={key} className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-700">
              {key.replace(/_/g, ' ')}: {value}
            </li>
          ))}
        </ul>
      )}
      <footer className="mt-3 flex gap-3 text-sm">
        <button type="button" onClick={onEdit} className="font-medium text-stone-900 underline">
          Edit
        </button>
        <button type="button" onClick={onDelete} className="font-medium text-red-700 underline">
          Delete
        </button>
      </footer>
    </article>
  )
}
