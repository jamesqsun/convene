import { loadDotEnvLocal } from './load-env'

async function main() {
  loadDotEnvLocal()
  const baseUrl = process.env.CONVENE_WORKER_URL,
    secret = process.env.CRON_SECRET
  if (!baseUrl || !secret) throw new Error('CONVENE_WORKER_URL and CRON_SECRET are required')
  const url = new URL('/api/jobs/city-interests', baseUrl)
  console.log(
    `Discovering city events on ${url.origin}. This sends interest check-ins to city subscribers.`,
  )
  let force = true,
    failures = 0
  do {
    const response = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
      body: JSON.stringify({ force }),
    })
    const body = await response.text()
    if (!response.ok) throw new Error(`Server returned ${response.status}: ${body}`)
    const result = JSON.parse(body)
    console.log(JSON.stringify(result, null, 2))
    failures += result.failed
    force = false
    if (!result.remaining) break
  } while (true)
  console.log(
    'Queued notifications continue delivering in the background. Cities already sent today are not repeated; keep the worker running for retries.',
  )
  if (failures) process.exitCode = 1
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
