import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PersonFeedback } from './PersonFeedback'

describe('PersonFeedback', () => {
  it('offers yes/no until answered, then locks and shows mutual friendship', () => {
    const open = renderToStaticMarkup(
      <PersonFeedback
        person={{ userId: 'b', name: 'Ben', interests: [], myAnswer: null, isMutualFriend: false }}
        onAnswer={() => undefined}
      />,
    )
    expect(open).toContain('>Yes<')
    const locked = renderToStaticMarkup(
      <PersonFeedback
        person={{ userId: 'b', name: 'Ben', interests: [], myAnswer: 'yes', isMutualFriend: true }}
        onAnswer={() => undefined}
      />,
    )
    expect(locked).toContain('You answered yes')
    expect(locked).toContain('Mutual friends')
    expect(locked).not.toContain('>No<')
  })
})
