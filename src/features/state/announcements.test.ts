import { describe, expect, it } from 'vitest'
import { newPlanIds } from './announcements'

describe('newPlanIds', () => {
  it('ignores the first load and reports additions afterwards', () => {
    expect(newPlanIds(null, ['a'])).toEqual([])
    expect(newPlanIds(['a'], ['a', 'b'])).toEqual(['b'])
    expect(newPlanIds(['a', 'b'], ['a'])).toEqual([])
  })
})
