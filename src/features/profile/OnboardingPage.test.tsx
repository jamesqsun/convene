import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { OnboardingPage } from './OnboardingPage'

describe('OnboardingPage', () => {
  it('renders a loading state before the profile arrives', () => {
    expect(renderToStaticMarkup(<OnboardingPage />)).toContain('Loading')
  })
})
