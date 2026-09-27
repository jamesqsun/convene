import { describe, expect, it } from 'vitest'
import { logoArc, logoSvg } from './logo-mark'

describe('logoSvg', () => {
  it('draws the mark at the requested size and colour', () => {
    const svg = logoSvg({ size: 192, color: '#56704a' })
    expect(svg).toContain('width="192"')
    expect(svg).toContain(logoArc)
    expect(svg).toContain('stroke="#56704a"')
    expect(svg).not.toContain('<rect')
  })

  it('pads the mark inside a tile when scaled down', () => {
    const svg = logoSvg({
      size: 512,
      color: '#fff',
      background: '#56704a',
      scale: 0.5,
      radius: 0.2,
    })
    expect(svg).toContain('viewBox="-72 -72 144 144"')
    expect(svg).toContain('fill="#56704a"')
    expect(svg).toContain('rx="28.8"')
  })
})
