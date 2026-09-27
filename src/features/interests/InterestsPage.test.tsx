import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { InterestCard } from './InterestsPage'
import type { InterestPrompt } from './store'

it('shows yes/no, safely renders topic text, and shows pending or failed memory updates', () => {
  const prompt: InterestPrompt = {
    id: 'id',
    text: '<script>example</script>',
    answer: null,
    memoriesUpdated: false,
    failed: false,
  }
  const render = (value = prompt) =>
    renderToStaticMarkup(<InterestCard prompt={value} busy={false} onAnswer={() => {}} />)
  expect(render()).toContain('>Yes<')
  expect(render()).toContain('>No<')
  expect(render()).toContain('&lt;script&gt;')
  const sourced = render({ ...prompt, sourceUrl: 'https://example.com/event' })
  expect(sourced).toContain('href="https://example.com/event"')
  expect(sourced).toContain('Event details and source')
  expect(render({ ...prompt, answer: 'no' })).toContain('You answered No')
  expect(render({ ...prompt, answer: 'yes' })).toContain('in the background')
  expect(render({ ...prompt, answer: 'yes', failed: true })).toContain('Retry memory update')
})
