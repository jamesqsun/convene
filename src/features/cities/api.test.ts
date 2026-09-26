import { describe, expect, it } from 'vitest'
import { noParams } from '@/lib/http'
import { citiesRoute } from './api'

const get = (q: string) =>
  new Request(`http://localhost:3000/api/cities?q=${encodeURIComponent(q)}`)

describe('cities route', () => {
  it('requires a session and a query of at least two characters', async () => {
    expect((await citiesRoute(async () => null)(get('tor'), noParams)).status).toBe(401)
    const signedIn = citiesRoute(async () => 'user-1')
    expect((await signedIn(get('t'), noParams)).status).toBe(400)
    const ok = await signedIn(get('toronto'), noParams)
    const body = (await ok.json()) as { matches: { label: string; timezone: string }[] }
    expect(body.matches[0]).toMatchObject({
      label: 'Toronto, Ontario, Canada',
      timezone: 'America/Toronto',
    })
  })
})
