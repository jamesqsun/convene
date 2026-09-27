import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BuildingMemories, OnboardingPage } from './OnboardingPage'

describe('OnboardingPage', () => {
  it('renders a loading state before the profile arrives', () => {
    const html = renderToStaticMarkup(<OnboardingPage />)
    expect(html).toContain('Loading')
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('animate-pulse')
  })

  it('animates memory building and announces only the heading', () => {
    const html = renderToStaticMarkup(<BuildingMemories />)
    expect(html).toContain('role="status"')
    expect(html).toContain('Turning your answers into memories')
    expect(html).toContain('Reading your answers')
    expect(html).toContain('onboarding-bar')
  })
})
