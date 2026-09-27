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
    <article className="card relative overflow-hidden pt-5 before:absolute before:inset-x-0 before:top-0 before:h-1 before:bg-sage/70">
      <header className="flex items-baseline justify-between gap-3">
        <h3 className="font-sans text-[15px] font-extrabold tracking-normal capitalize">
          {memory.topic}
        </h3>
        {memory.editedAt !== null && <span className="hint shrink-0">Edited by you</span>}
      </header>
      <p className="mt-1 text-sm text-ink/85">{memory.summary}</p>
      {attributes.length > 0 && (
        <ul className="mt-2.5 flex flex-wrap gap-1.5">
          {attributes.map(([key, value]) => (
            <li key={key} className="pill pill-sage font-semibold">
              {key.replace(/_/g, ' ')}: {value}
            </li>
          ))}
        </ul>
      )}
      <footer className="mt-3 flex gap-4 border-t border-dashed border-line pt-3 text-[13px] font-bold">
        <button
          type="button"
          onClick={onEdit}
          className="text-ink underline decoration-line underline-offset-2 hover:decoration-sage"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="text-clay-deep underline decoration-clay-deep/30 underline-offset-2 hover:decoration-clay-deep"
        >
          Delete
        </button>
      </footer>
    </article>
  )
}
