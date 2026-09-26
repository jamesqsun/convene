import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AnswersStep, BasicsStep, CityStep, InterestsStep, PhoneStep } from './OnboardingSteps'
import { onboardingPrompts } from './schemas'

const noop = async () => undefined

describe('onboarding steps', () => {
  it('render their fields with prior values', () => {
    expect(
      renderToStaticMarkup(<BasicsStep initial={{ name: 'Maya', age: 29 }} onSave={noop} />),
    ).toContain('value="Maya"')
    expect(renderToStaticMarkup(<CityStep initial={{ city: null }} onSave={noop} />)).toContain(
      'disabled=""',
    )
    expect(renderToStaticMarkup(<PhoneStep initial={{ phone: '' }} onSave={noop} />)).toContain(
      'type="tel"',
    )
    const interests = renderToStaticMarkup(
      <InterestsStep initial={{ interests: ['coffee'] }} onSave={noop} />,
    )
    expect(interests).toContain('aria-pressed="true"')
    const answers = renderToStaticMarkup(<AnswersStep initial={{ answers: [] }} onSave={noop} />)
    for (const prompt of onboardingPrompts) expect(answers).toContain(prompt.text)
  })

  it('exposes no removed controls', () => {
    const html = [
      renderToStaticMarkup(<BasicsStep initial={{ name: '', age: null }} onSave={noop} />),
      renderToStaticMarkup(<InterestsStep initial={{ interests: [] }} onSave={noop} />),
    ].join('')
    for (const word of ['budget', 'group size', 'platform', 'online', 'radius'])
      expect(html.toLowerCase()).not.toContain(word)
  })
})
