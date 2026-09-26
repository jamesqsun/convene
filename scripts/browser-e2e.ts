/**
 * Browser end-to-end test: drives the real UI in the Chrome installed on this machine against a
 * running demo-mode server. Covers persona sign-in, planning, plan detail, withdrawal, memory
 * editing, feedback, the graph, and a fresh account through onboarding. Fails on any page error.
 *
 * Usage: CONVENE_SMOKE_URL=http://localhost:3000 pnpm e2e
 * Optional: CHROME_PATH, CONVENE_E2E_SHOTS (directory for screenshots)
 */
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import puppeteer, { type Page } from 'puppeteer-core'

const baseUrl = process.env.CONVENE_SMOKE_URL ?? 'http://localhost:3000'
const chromePath =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const shotsDir = process.env.CONVENE_E2E_SHOTS ?? null
const timeout = 15_000

const problems: string[] = []

async function step(label: string, run: () => Promise<void>): Promise<void> {
  await run()
  console.log(`  ok  ${label}`)
}

/** Case-insensitive, since rendered text may be transformed by CSS (capitalized titles, for one). */
async function waitForText(page: Page, text: string): Promise<void> {
  await page.waitForFunction(
    (needle: string) => document.body.innerText.toLowerCase().includes(needle.toLowerCase()),
    { timeout },
    text,
  )
}

async function waitForPath(page: Page, pathname: string): Promise<void> {
  await page.waitForFunction(
    (expected: string) => location.pathname === expected,
    { timeout },
    pathname,
  )
}

/** Scrolls the target to the middle of the screen, verifies nothing covers it, then clicks it. */
async function clickText(page: Page, text: string): Promise<void> {
  const handle = await page.waitForSelector(`::-p-text(${text})`, { timeout })
  const covering = await handle!.evaluate((element) => {
    element.scrollIntoView({ block: 'center' })
    const box = element.getBoundingClientRect()
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
    return hit && !element.contains(hit) && !hit.contains(element)
      ? hit.outerHTML.slice(0, 120)
      : null
  })
  if (covering) throw new Error(`"${text}" is covered by ${covering}`)
  await handle!.click()
}

async function shot(page: Page, name: string): Promise<void> {
  if (!shotsDir) return
  await page.screenshot({
    path: path.join(shotsDir, `${name}.png`) as `${string}.png`,
    fullPage: false,
  })
}

async function signInAs(page: Page, name: string): Promise<void> {
  await page.goto(`${baseUrl}/sign-in`, { waitUntil: 'networkidle0' })
  await waitForText(page, 'Demo personas')
  await clickText(page, name)
  await waitForPath(page, '/availability')
  await waitForText(page, 'Availability')
}

async function signOut(page: Page): Promise<void> {
  await page.goto(`${baseUrl}/profile`, { waitUntil: 'networkidle0' })
  await clickText(page, 'Sign out')
  await waitForPath(page, '/sign-in')
}

async function mayaFlow(page: Page): Promise<void> {
  console.log('Maya: planning, plan detail, withdrawal, memory editing')
  await step('signs in from a persona chip', () => signInAs(page, 'Maya'))
  await step('sees seeded availability waiting for its batch', () =>
    waitForText(page, 'Waiting for its planning batch'),
  )
  await shot(page, 'availability-before')
  await step('runs planning from the demo button and gets an assignment banner', async () => {
    await clickText(page, 'Run planning now (demo)')
    await waitForText(page, 'plan(s) assigned')
    await waitForText(page, 'New plan assigned')
  })
  await shot(page, 'availability-after')
  await step('opens the plan and sees people with phone numbers', async () => {
    await clickText(page, 'See the details')
    await page.waitForFunction(() => location.pathname.startsWith('/plans/'), { timeout })
    await waitForText(page, 'Withdraw from this plan')
    await page.waitForSelector('a[href^="tel:"]', { timeout })
  })
  await shot(page, 'plan-detail')
  await step('withdraws (confirm dialog accepted)', async () => {
    await clickText(page, 'Withdraw from this plan')
    await waitForText(page, 'You left')
  })
  await step('edits and deletes a memory on the profile', async () => {
    await page.goto(`${baseUrl}/profile`, { waitUntil: 'networkidle0' })
    await waitForText(page, 'What Convene remembers')
    const before = (await page.$$('article')).length
    await clickText(page, 'Edit')
    const title = await page.waitForSelector('form input', { timeout })
    await title!.click({ count: 3 })
    await title!.type('Quiet corners')
    await clickText(page, 'Save')
    await waitForText(page, 'Quiet corners')
    await waitForText(page, 'Edited by you')
    await clickText(page, 'Delete')
    await page.waitForFunction(
      (count: number) => document.querySelectorAll('article').length < count,
      { timeout },
      before,
    )
  })
  await shot(page, 'profile')
  await step('signs out', () => signOut(page))
}

async function benFlow(page: Page): Promise<void> {
  console.log('Ben: feedback and graph')
  await step('signs in', () => signInAs(page, 'Ben'))
  await step('answers yes about a past co-participant', async () => {
    await page.goto(`${baseUrl}/hangouts`, { waitUntil: 'networkidle0' })
    await waitForText(page, 'Past hangouts')
    await clickText(page, 'Yes')
    await waitForText(page, 'You answered yes')
  })
  await shot(page, 'hangouts')
  await step('renders the connection graph', async () => {
    await page.goto(`${baseUrl}/graph`, { waitUntil: 'networkidle0' })
    await page.waitForSelector('svg[aria-label="Your connections"]', { timeout })
    await waitForText(page, 'Maya')
  })
  await shot(page, 'graph')
  await step('signs out', () => signOut(page))
}

async function fillOnboarding(page: Page): Promise<void> {
  await waitForText(page, 'Let us get to know you')
  await page.type('form input[required]', 'Browser Tester')
  await page.type('input[type="number"]', '31')
  await clickText(page, 'Continue')
  await waitForText(page, 'Where are you?')
  await page.type('input[aria-label="City"]', 'toron')
  await page.locator('[role="option"]').setTimeout(timeout).click()
  await clickText(page, 'Continue')
  await waitForText(page, 'How can plans reach you?')
  await page.type('input[type="tel"]', '+1 416 555 0177')
  await clickText(page, 'Continue')
  await waitForText(page, 'What are you into?')
  for (const interest of ['coffee', 'hiking', 'books']) await clickText(page, interest)
  await clickText(page, 'Continue')
  await waitForText(page, 'A few questions')
  const answers = [
    'A slow start, a long walk somewhere green, then coffee in a quiet place with a book.',
    'Small groups with something to do; conversation is easier when hands are busy.',
    'Bouldering for beginners, with people who will laugh with me rather than at me.',
  ]
  const areas = await page.$$('textarea')
  for (const [index, area] of areas.entries()) await area.type(answers[index]!)
  await clickText(page, 'Finish')
}

async function newcomerFlow(page: Page): Promise<void> {
  console.log('Newcomer: sign-up and onboarding')
  await step('creates an account', async () => {
    await page.goto(`${baseUrl}/sign-up`, { waitUntil: 'networkidle0' })
    await page.type('input[type="email"]', `browser-${Date.now()}@example.test`)
    await page.type('input[type="password"]', 'password123')
    await clickText(page, 'Create account')
    await waitForPath(page, '/onboarding')
  })
  await step('completes every onboarding step and lands on availability', async () => {
    await fillOnboarding(page)
    await waitForPath(page, '/availability')
    await waitForText(page, 'No availability yet')
  })
  await shot(page, 'onboarded')
}

async function main(): Promise<void> {
  if (shotsDir) mkdirSync(shotsDir, { recursive: true })
  const probe = await fetch(`${baseUrl}/api/auth/demo-personas`)
  if (probe.status !== 200) throw new Error('The browser test only runs against a demo-mode server')
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox'],
  })
  let page: Page | null = null
  try {
    page = await browser.newPage()
    await page.setViewport({ width: 390, height: 844 })
    page.on('pageerror', (error: unknown) =>
      problems.push(`page error: ${error instanceof Error ? error.message : String(error)}`),
    )
    page.on('console', (message) => {
      if (message.type() === 'error' && !message.text().includes('favicon'))
        problems.push(`console error: ${message.text()}`)
    })
    page.on('dialog', (dialog) => void dialog.accept())
    await mayaFlow(page)
    await benFlow(page)
    await newcomerFlow(page)
    await page.setViewport({ width: 1280, height: 860 })
    await page.goto(`${baseUrl}/plans`, { waitUntil: 'networkidle0' })
    await waitForText(page, 'Plans')
    await shot(page, 'desktop-plans')
  } catch (error) {
    if (page && shotsDir)
      await page.screenshot({ path: path.join(shotsDir, 'failure.png') as `${string}.png` })
    if (page)
      console.error(
        `  at ${page.url()}: ${(await page.evaluate(() => document.body.innerText)).slice(0, 400)}`,
      )
    throw error
  } finally {
    await browser.close()
  }
  if (problems.length > 0) {
    console.error('Browser reported problems:')
    for (const problem of problems) console.error(`  - ${problem}`)
    process.exit(1)
  }
  console.log('Browser end-to-end test passed with no page or console errors.')
}

main().catch((error) => {
  console.error('Browser end-to-end test failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
