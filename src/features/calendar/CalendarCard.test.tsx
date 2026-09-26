import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CalendarCard } from './CalendarCard'

describe('CalendarCard', () => {
  it('renders nothing until the status has loaded', () => {
    expect(renderToStaticMarkup(<CalendarCard onChanged={async () => undefined} />)).toBe('')
  })
})
