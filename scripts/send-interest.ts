import { randomUUID } from 'node:crypto'
import { loadDotEnvLocal } from './load-env'

async function main() {
  loadDotEnvLocal()
  const text = process.argv.slice(2).join(' ').trim()
  if (!text || text.length > 400)
    throw new Error('Usage: pnpm interests:send "Topic or event (1–400 characters)"')
  const baseUrl = process.env.CONVENE_WORKER_URL,
    secret = process.env.CRON_SECRET
  if (!baseUrl || !secret) throw new Error('CONVENE_WORKER_URL and CRON_SECRET are required')
  const url = new URL('/api/jobs/send-interest', baseUrl)
  console.log(`Sending interest check-in to all subscribed users on ${url.origin}…`)
  const response = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
    body: JSON.stringify({ requestId: randomUUID(), text }),
  })
  const body = await response.text()
  if (!response.ok) throw new Error(`Server returned ${response.status}: ${body}`)
  const result = JSON.parse(body)
  console.log(
    `Queued for ${result.recipients} users. Prompt: ${result.promptId}. Delivery continues in the background.`,
  )
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
