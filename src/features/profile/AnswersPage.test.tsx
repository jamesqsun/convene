import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AnswersPage } from './AnswersPage'

describe('AnswersPage', () => {
  it('renders a loading state first', () => {
    expect(renderToStaticMarkup(<AnswersPage />)).toContain('Loading')
  })
})
