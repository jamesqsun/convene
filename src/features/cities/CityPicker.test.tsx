import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CityPicker } from './CityPicker'

describe('CityPicker', () => {
  it('shows the selected city and an input', () => {
    const html = renderToStaticMarkup(
      <CityPicker
        value={{ key: 'ca:ontario:toronto', label: 'Toronto, Ontario, Canada' }}
        onChange={() => undefined}
      />,
    )
    expect(html).toContain('value="Toronto, Ontario, Canada"')
    expect(html).toContain('Selected: Toronto, Ontario, Canada')
  })
})
