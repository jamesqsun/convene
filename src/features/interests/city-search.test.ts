import { expect, it, vi } from 'vitest'
import type OpenAI from 'openai'
import { museCitySearch } from './city-search'

const city = {
  key: 'toronto',
  name: 'Toronto',
  timezone: 'America/Toronto',
  date: '2026-10-01',
  previous: [],
}
const event = {
  text: 'Toronto food festival on October 3',
  date: '2026-10-03',
  sourceUrl: 'https://example.com/festival',
}
function stub() {
  const create = vi.fn(async () => ({
    output_text: 'A cited festival',
    output: [
      { type: 'web_search_call' },
      {
        type: 'message',
        content: [
          { type: 'output_text', annotations: [{ type: 'url_citation', url: event.sourceUrl }] },
        ],
      },
    ],
  }))
  const parse = vi.fn(async () => ({ output_parsed: { event } }))
  return { create, parse, client: { responses: { create, parse } } as unknown as OpenAI }
}
it('uses live Muse search and only accepts a cited event within the upcoming window', async () => {
  const { create, parse, client } = stub()
  const search = museCitySearch({ apiKey: 'test', model: 'muse-spark-1.3' }, client)
  expect(await search(city)).toEqual(event)
  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({ tools: [{ type: 'web_search' }], store: false }),
  )
  parse.mockResolvedValueOnce({
    output_parsed: { event: { ...event, sourceUrl: 'https://invented.test' } },
  })
  await expect(search(city)).rejects.toThrow('cited source')
  parse.mockResolvedValueOnce({ output_parsed: { event: { ...event, date: '2025-10-01' } } })
  await expect(search(city)).rejects.toThrow('date window')
})
it('does not broadcast uncited or unsearched recollections', async () => {
  const { create, parse, client } = stub()
  create.mockResolvedValueOnce({ output_text: 'Guess', output: [] })
  const search = museCitySearch({ apiKey: 'test', model: 'muse-spark-1.3' }, client)
  await expect(search(city)).rejects.toThrow('web search')
  create.mockResolvedValueOnce({ output_text: 'None found', output: [{ type: 'web_search_call' }] })
  await expect(search(city)).rejects.toThrow('no source citations')
  expect(parse).not.toHaveBeenCalled()
})
