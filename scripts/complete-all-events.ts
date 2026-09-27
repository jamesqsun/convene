import { loadDotEnvLocal } from './load-env'

async function main(): Promise<void> {
  loadDotEnvLocal()
  const baseUrl = process.env.CONVENE_WORKER_URL
  const secret = process.env.CRON_SECRET
  if (!baseUrl || !secret) throw new Error('CONVENE_WORKER_URL and CRON_SECRET are required')
  const url = new URL('/api/jobs/complete-events', baseUrl)
  console.log(
    `Completing all unfinished scheduled events on ${url.origin} by backdating their times.`,
  )
  const response = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
    body: '{}',
  })
  const body = await response.text()
  if (!response.ok) throw new Error(`Server returned ${response.status}: ${body}`)
  console.log(JSON.stringify(JSON.parse(body), null, 2))
  console.log('Feedback reminders are queued; notification delivery continues in the background.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
