import { expect, it } from 'vitest'
import { mapConcurrent } from './concurrency'

it('limits simultaneous work and retains input order', async () => {
  let active = 0,
    max = 0
  const results = await mapConcurrent([3, 2, 1, 0], 2, async (value) => {
    active++
    max = Math.max(max, active)
    await new Promise((resolve) => setTimeout(resolve, value * 5))
    active--
    return value * 2
  })
  expect(max).toBe(2)
  expect(results).toEqual([6, 4, 2, 0])
})
it('waits for in-flight work before reporting an error', async () => {
  let finished = false
  await expect(
    mapConcurrent([1, 2], 2, async (value) => {
      if (value === 1) throw new Error('failed')
      await new Promise((resolve) => setTimeout(resolve, 10))
      finished = true
    }),
  ).rejects.toThrow('failed')
  expect(finished).toBe(true)
})
