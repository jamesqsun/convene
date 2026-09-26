import { loadDotEnvLocal } from './load-env'

/**
 * Local scheduler: posts to /api/jobs/run on a cadence with the shared secret.
 * Usage: pnpm worker [--once] [--interval-seconds N]
 */

async function tick(baseUrl: string, secret: string): Promise<void> {
  const response = await fetch(`${baseUrl}/api/jobs/run`, {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
    body: '{}',
  })
  const body = await response.text()
  console.log(`[worker] ${new Date().toISOString()} ${response.status} ${body.slice(0, 500)}`)
}

async function main(): Promise<void> {
  loadDotEnvLocal()
  const baseUrl = process.env.CONVENE_WORKER_URL ?? 'http://localhost:3000'
  const secret = process.env.CRON_SECRET
  if (!secret) throw new Error('CRON_SECRET is required')
  const isOnce = process.argv.includes('--once')
  const intervalIndex = process.argv.indexOf('--interval-seconds')
  const intervalSeconds = intervalIndex >= 0 ? Number(process.argv[intervalIndex + 1]) : 60
  await tick(baseUrl, secret)
  if (isOnce) return
  setInterval(
    () => tick(baseUrl, secret).catch((error) => console.error('[worker]', error)),
    intervalSeconds * 1000,
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
