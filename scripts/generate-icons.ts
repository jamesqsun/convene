/**
 * Renders the app icons and favicon from the shared logo drawing, in the Chrome installed on this
 * machine (the same one `pnpm e2e` drives), so every icon matches the logo on the site.
 *
 * Usage: pnpm icons   (optional: CHROME_PATH)
 */
import { writeFileSync } from 'node:fs'
import puppeteer from 'puppeteer-core'
import { type LogoSvgOptions, logoSvg } from '../src/features/brand/logo-mark'

const chromePath =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const sage = '#56704a'
const linen = '#f5f5f5'

// Rounded sage tiles with a light mark for the manifest and notifications; a full-bleed square
// with extra padding for maskable icons (the OS crops them) and Apple's icon (iOS rounds it).
const icons: { file: string; options: LogoSvgOptions }[] = [
  { file: 'public/icons/icon-192.png', options: tile(192, 0.6, 0.22) },
  { file: 'public/icons/icon-512.png', options: tile(512, 0.6, 0.22) },
  { file: 'public/icons/icon-maskable-512.png', options: tile(512, 0.46, 0) },
  { file: 'src/app/apple-icon.png', options: tile(180, 0.56, 0) },
  { file: 'src/app/icon.png', options: tile(64, 0.66, 0.22) },
]

function tile(size: number, scale: number, radius: number): LogoSvgOptions {
  return { size, color: linen, background: sage, scale, radius }
}

async function main() {
  const browser = await puppeteer.launch({ executablePath: chromePath, headless: true })
  try {
    const page = await browser.newPage()
    for (const { file, options } of icons) {
      await page.setViewport({ width: options.size, height: options.size })
      await page.setContent(
        `<style>html,body{margin:0;background:transparent}svg{display:block}</style>${logoSvg(options)}`,
      )
      const png = await page.screenshot({ omitBackground: true, type: 'png' })
      writeFileSync(file, png)
      console.log(`  wrote ${file}`)
    }
  } finally {
    await browser.close()
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
