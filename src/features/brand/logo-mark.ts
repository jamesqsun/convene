/**
 * The Convene mark: a C drawn as one line whose dots close up into a solid stroke and end in an
 * arrow pointing back into the opening, people gathering into one plan. Coordinates are centred
 * on the origin; `logoViewBox` frames them. Shared by the React logo and `scripts/render-icons.ts`
 * so the site and the app icons can never drift apart.
 */
export const logoViewBox = '-36 -36 72 72'

export const logoArc = 'M21.2 -21.2 A30 30 0 1 0 23 19.3'
export const logoStrokeWidth = 7
/** Round dots with even gaps, then dashes that lengthen as the gaps shrink, then solid. */
export const logoDashes = '0 11 0 11 0 11 0 10.5 1.5 10 4 9 8 8.5 13 8 200 0'
export const logoArrow = 'M28.3 14.1 L25.4 25.4 L16.9 17 Z'

export interface LogoSvgOptions {
  size: number
  color: string
  background?: string
  /** Share of the canvas the mark spans, before the icon's own padding (1 = edge to edge). */
  scale?: number
  /** Corner radius as a share of the size; 0 gives a square tile (maskable icons need that). */
  radius?: number
}

/** A standalone SVG document of the mark, for rasterising into favicons and app icons. */
export function logoSvg({
  size,
  color,
  background,
  scale = 1,
  radius = 0,
}: LogoSvgOptions): string {
  const viewSize = 72 / scale
  const origin = -viewSize / 2
  const tile = background
    ? `<rect x="${origin}" y="${origin}" width="${viewSize}" height="${viewSize}" rx="${viewSize * radius}" fill="${background}"/>`
    : ''
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${origin} ${origin} ${viewSize} ${viewSize}">` +
    tile +
    `<path d="${logoArc}" fill="none" stroke="${color}" stroke-width="${logoStrokeWidth}" stroke-linecap="round" stroke-dasharray="${logoDashes}"/>` +
    `<path d="${logoArrow}" fill="${color}" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>` +
    `</svg>`
  )
}
