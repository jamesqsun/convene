'use client'

import { useState } from 'react'
import type { Memory } from './store'

export interface MemoryEditorProps {
  memory: Memory
  onSave: (patch: {
    topic: string
    summary: string
    attributes: Record<string, string>
  }) => Promise<void>
  onCancel: () => void
}

type Row = { key: string; value: string }

const inputClass = 'field'

/** Inline editor for a memory's title, summary, and individual attributes. */
export function MemoryEditor({ memory, onSave, onCancel }: MemoryEditorProps) {
  const [topic, setTopic] = useState(memory.topic)
  const [summary, setSummary] = useState(memory.summary)
  const [rows, setRows] = useState<Row[]>(
    Object.entries(memory.attributes).map(([key, value]) => ({ key, value })),
  )
  const [error, setError] = useState<string | null>(null)

  const updateRow = (index: number, patch: Partial<Row>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)))

  async function submit() {
    const attributes = Object.fromEntries(
      rows
        .filter((row) => row.key.trim() && row.value.trim())
        .map((row) => [row.key.trim(), row.value.trim()]),
    )
    try {
      await onSave({ topic: topic.trim(), summary: summary.trim(), attributes })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save')
    }
  }

  return (
    <form
      className="card relative overflow-hidden border-sage pt-5 before:absolute before:inset-x-0 before:top-0 before:h-1 before:bg-sage"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <label className="field-label">
        Title
        <input
          required
          maxLength={80}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          className={inputClass}
        />
      </label>
      <label className="field-label mt-3">
        Summary
        <textarea
          required
          maxLength={500}
          rows={3}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          className={inputClass}
        />
      </label>
      <fieldset className="mt-3">
        <legend className="eyebrow">Attributes</legend>
        {rows.map((row, index) => (
          <div key={index} className="mt-2 flex items-center gap-2">
            <input
              aria-label="Attribute name"
              pattern="[a-z][a-z0-9_]*"
              value={row.key}
              onChange={(e) => updateRow(index, { key: e.target.value })}
              className={`${inputClass} mt-0 w-2/5`}
            />
            <input
              aria-label="Attribute value"
              value={row.value}
              onChange={(e) => updateRow(index, { value: e.target.value })}
              className={`${inputClass} mt-0`}
            />
            <button
              type="button"
              aria-label="Remove attribute"
              onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
              className="px-2 text-lg leading-none text-muted hover:text-ink"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setRows((current) => [...current, { key: '', value: '' }])}
          className="link mt-2.5 text-[13px]"
        >
          Add attribute
        </button>
      </fieldset>
      {error && <p className="mt-2 text-sm text-clay-deep">{error}</p>}
      <div className="mt-4 flex gap-2">
        <button type="submit" className="btn btn-primary btn-sm">
          Save
        </button>
        <button type="button" onClick={onCancel} className="btn btn-outline btn-sm">
          Cancel
        </button>
      </div>
    </form>
  )
}
