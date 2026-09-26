import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MemoryEditor } from './MemoryEditor'

const memory = {
  id: 'm',
  topic: 'coffee',
  summary: 'Likes quiet cafes.',
  evidence: [],
  attributes: { setting: 'quiet' },
  confidence: 0.6,
  source: 'onboarding',
  editedAt: null,
  createdAt: 0,
}

describe('MemoryEditor', () => {
  it('pre-fills title, summary, and attribute rows', () => {
    const html = renderToStaticMarkup(
      <MemoryEditor memory={memory} onSave={async () => undefined} onCancel={() => undefined} />,
    )
    expect(html).toContain('value="coffee"')
    expect(html).toContain('Likes quiet cafes.')
    expect(html).toContain('value="setting"')
    expect(html).toContain('value="quiet"')
  })
})
