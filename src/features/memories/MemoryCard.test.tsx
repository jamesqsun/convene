import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MemoryCard } from './MemoryCard'

const memory = {
  id: 'm',
  topic: 'coffee',
  summary: 'Likes quiet cafes.',
  evidence: ['secret verbatim'],
  attributes: { setting: 'quiet' },
  confidence: 0.6,
  source: 'onboarding',
  editedAt: 1,
  createdAt: 0,
}

describe('MemoryCard', () => {
  it('shows topic, summary, attributes, and only Edit and Delete controls', () => {
    const html = renderToStaticMarkup(
      <MemoryCard memory={memory} onEdit={() => undefined} onDelete={() => undefined} />,
    )
    expect(html).toContain('coffee')
    expect(html).toContain('setting: quiet')
    expect(html).toContain('Edited by you')
    expect(html).toContain('>Edit<')
    expect(html).toContain('>Delete<')
    expect(html.toLowerCase()).not.toContain('use less')
  })
})
