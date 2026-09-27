import { loadDotEnvLocal } from './load-env'

async function main(): Promise<void> {
  loadDotEnvLocal()
  const baseUrl = process.env.CONVENE_WORKER_URL
  const secret = process.env.CRON_SECRET
  if (!baseUrl || !secret) throw new Error('CONVENE_WORKER_URL and CRON_SECRET are required')
  const url = new URL('/api/jobs/run', baseUrl)
  console.log(
    `Running all plannable batches on ${url.origin}. This creates hangouts and sends notifications.`,
  )
  const response = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
    body: JSON.stringify({ allBatches: true }),
  })
  const body = await response.text()
  if (!response.ok) throw new Error(`Server returned ${response.status}: ${body}`)
  const summary = JSON.parse(body)
  console.log(JSON.stringify(summary, null, 2))
  if (
    summary.batches?.some(
      (batch: { status: string; groups: { status: string }[] }) =>
        batch.status === 'failed' || batch.groups.some((group) => group.status === 'failed'),
    )
  )
    process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
