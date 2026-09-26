import { describe, expect, it } from 'vitest'
import { isInterest } from '@/features/profile/interests'
import { activities, activityById } from './catalog'

describe('activity catalog', () => {
  it('has unique ids, sorted positive durations, and tags from the interest vocabulary', () => {
    expect(new Set(activities.map((a) => a.id)).size).toBe(activities.length)
    for (const activity of activities) {
      expect(activity.durationsMinutes.length).toBeGreaterThan(0)
      expect([...activity.durationsMinutes].sort((a, b) => a - b)).toEqual(
        activity.durationsMinutes,
      )
      expect(activity.durationsMinutes.every((d) => d >= 60)).toBe(true)
      expect(activity.tags.every(isInterest)).toBe(true)
      expect(activity.placesQuery.length).toBeGreaterThan(0)
    }
  })

  it('looks activities up by id', () => {
    expect(activityById('coffee')?.name).toBe('Coffee and conversation')
    expect(activityById('skydiving')).toBeUndefined()
  })
})
