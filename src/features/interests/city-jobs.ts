import { randomUUID } from 'node:crypto'
import type { Db } from '@/lib/db'
import { localDateOf } from '@/lib/time'
import { broadcastInterest } from './store'
import { CitySearchSkipped, type CitySearch } from './city-search'

/** Enqueue one search per city/local date; forced runs retry failures/skips but never repeat a sent broadcast. */
export async function enqueueCityInterests(db: Db, now: number, force = false) {
  const cities = await db.query<{ key: string; name: string; timezone: string }>(
    `select distinct on (city_key) city_key as key, city_name as name, city_timezone as timezone
     from profiles where city_key is not null and city_timezone is not null order by city_key, id`,
  )
  for (const city of cities) {
    await db.query(
      `insert into city_interest_jobs (city_key, local_date, city_name, timezone, next_attempt_at)
      values ($1, $2::date, $3, $4, $5::timestamptz) on conflict (city_key, local_date) do update
      set status = 'pending', attempts = 0, next_attempt_at = excluded.next_attempt_at, last_error = null
      where $6 and city_interest_jobs.status in ('skipped', 'failed')`,
      [
        city.key,
        localDateOf(city.timezone, now),
        city.name || city.key,
        city.timezone,
        new Date(now).toISOString(),
        force,
      ],
    )
  }
  return cities.length
}

export async function drainCityInterests(db: Db, search: CitySearch, clock: () => number) {
  const claim = randomUUID(),
    now = new Date(clock()).toISOString()
  const jobs = await db.query<{
    city_key: string
    date: string
    city_name: string
    timezone: string
    attempts: number
  }>(
    `with candidates as (
      select city_key, local_date from city_interest_jobs
      where status in ('pending', 'running', 'failed') and attempts < 5 and next_attempt_at <= $1::timestamptz
      and (lease_until is null or lease_until < $1::timestamptz)
      and local_date = ($1::timestamptz at time zone timezone)::date
      order by local_date, city_key limit 2 for update skip locked
    ) update city_interest_jobs j set status = 'running', attempts = attempts + 1,
      claim_id = $2, lease_until = $1::timestamptz + interval '10 minutes'
      from candidates c where j.city_key = c.city_key and j.local_date = c.local_date
      returning j.city_key, j.local_date::text as date, j.city_name, j.timezone, j.attempts`,
    [now, claim],
  )
  const results = await Promise.all(
    jobs.map(async (job) => {
      try {
        const previous = await db.query<{ text: string; source_url: string }>(
          `select text, source_url from interest_prompts where city_key = $1 and created_at > $2::timestamptz - interval '30 days' order by created_at desc limit 30`,
          [job.city_key, now],
        )
        const event = await search({
          key: job.city_key,
          name: job.city_name,
          timezone: job.timezone,
          date: job.date,
          previous: previous.map((p) => p.text),
        })
        return await db.transaction(async (tx) => {
          const [current] = await tx.query<{ claim_id: string }>(
            'select claim_id from city_interest_jobs where city_key = $1 and local_date = $2::date for update',
            [job.city_key, job.date],
          )
          if (current?.claim_id !== claim)
            return {
              city: job.city_name,
              status: 'superseded',
              reason: 'Claim taken over by another worker',
              recipients: 0,
            }
          const duplicate =
            event && previous.some((p) => p.text === event.text || p.source_url === event.sourceUrl)
          const prompt =
            event && !duplicate
              ? await broadcastInterest(tx, randomUUID(), event.text, clock(), {
                  key: job.city_key,
                  sourceUrl: event.sourceUrl,
                })
              : null
          const status = prompt ? 'sent' : 'skipped'
          const reason = prompt
            ? null
            : duplicate
              ? 'Event source or text was already suggested within the last 30 days'
              : 'Muse found no suitable verified upcoming event in the next 14 days'
          await tx.query(
            `update city_interest_jobs set status = $3, prompt_id = $4, claim_id = null, lease_until = null, last_error = $5 where city_key = $1 and local_date = $2::date`,
            [job.city_key, job.date, status, prompt?.promptId ?? null, reason],
          )
          return { city: job.city_name, status, reason, recipients: prompt?.recipients ?? 0 }
        })
      } catch (error) {
        const skipped = error instanceof CitySearchSkipped
        const reason = skipped ? error.message : 'City event discovery failed; see server logs'
        if (!skipped) console.error('[city-interests] search failed:', job.city_key, error)
        await db.query(
          `update city_interest_jobs set status = $5, claim_id = null, lease_until = null,
        next_attempt_at = $4::timestamptz, last_error = $6
        where city_key = $1 and local_date = $2::date and claim_id = $3`,
          [
            job.city_key,
            job.date,
            claim,
            new Date(clock() + 2 ** job.attempts * 60_000).toISOString(),
            skipped ? 'skipped' : 'failed',
            reason,
          ],
        )
        return {
          city: job.city_name,
          status: skipped ? 'skipped' : 'failed',
          reason,
          recipients: 0,
        }
      }
    }),
  )
  return {
    claimed: jobs.length,
    sent: results.filter((r) => r.status === 'sent').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    failed: results.filter((r) => r.status === 'failed').length,
    details: results,
  }
}
