import { describe, expect, it } from 'vitest'
import { isSupported, keepSupported } from './evidence'

const answers = ['A long hike,  then coffee somewhere quiet.', 'Small groups make it easy to talk.']
const draft = (evidence: string[]) => ({
  topic: 't',
  summary: 's',
  evidence,
  attributes: [],
  confidence: 0.5,
})

describe('evidence validation', () => {
  it('matches verbatim fragments ignoring case and whitespace', () => {
    expect(isSupported('then COFFEE somewhere', answers)).toBe(true)
    expect(isSupported('a long hike, then coffee', answers)).toBe(true)
    expect(isSupported('loves espresso', answers)).toBe(false)
    expect(isSupported('  ', answers)).toBe(false)
  })

  it('keeps only supported evidence and drops unsupported memories', () => {
    const kept = keepSupported(
      [draft(['small groups', 'invented claim']), draft(['nothing real'])],
      answers,
    )
    expect(kept).toHaveLength(1)
    expect(kept[0]!.evidence).toEqual(['small groups'])
  })
})
