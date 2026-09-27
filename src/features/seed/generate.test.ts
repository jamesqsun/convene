import { describe, expect, it } from 'vitest'
import { memoryDraftSchema } from '@/features/ai/schemas'
import { resolveCity } from '@/features/cities/search'
import { activityById } from '@/features/planning/activities/catalog'
import { isInterest, maxInterests } from '@/features/profile/interests'
import { answerSchema } from '@/features/profile/schemas'
import { generatedPastEvents, generatedPeople } from './generate'
import { personas } from './people'

const people = generatedPeople(200)
const pastEvents = generatedPastEvents(people, 60)
const cityOf = new Map(people.map((person) => [person.id, person.cityKey]))

describe('generatedPeople', () => {
  it('is deterministic, and a smaller count is a prefix of a larger one', () => {
    expect(generatedPeople(200)).toEqual(people)
    expect(generatedPeople(25)).toEqual(people.slice(0, 25))
    expect(generatedPeople(0)).toEqual([])
  })

  it('never collides with the hand-written cast or with itself', () => {
    const everyone = [...personas, ...people]
    expect(new Set(everyone.map((person) => person.id)).size).toBe(everyone.length)
    expect(new Set(everyone.map((person) => person.email)).size).toBe(everyone.length)
    expect(new Set(everyone.map((person) => person.phone)).size).toBe(everyone.length)
    expect(people.every((person) => /^[0-9a-f-]{36}$/.test(person.id))).toBe(true)
  })

  it('keeps everyone fictional: demo emails and reserved 555-01xx phone numbers', () => {
    expect(people.every((person) => /^[a-z.0-9]+@convene\.demo$/.test(person.email))).toBe(true)
    expect(people.every((person) => /^\+1\d{3}55501\d{2}$/.test(person.phone))).toBe(true)
  })

  it('produces profiles the application schemas accept', () => {
    for (const person of people) {
      expect(resolveCity(person.cityKey)).not.toBeNull()
      expect(person.age).toBeGreaterThanOrEqual(18)
      expect(person.interests.length).toBeGreaterThan(0)
      expect(person.interests.length).toBeLessThanOrEqual(maxInterests)
      expect(person.interests.every(isInterest)).toBe(true)
      expect(new Set(person.interests).size).toBe(person.interests.length)
      expect(person.answers.map((answer) => answer.promptId)).toEqual([
        'weekend',
        'meeting_people',
        'try_new',
      ])
      expect(person.answers.every((answer) => answerSchema.safeParse(answer).success)).toBe(true)
    }
  })

  it('backs every memory with evidence copied verbatim from the answers', () => {
    for (const person of people) {
      const answerText = person.answers.map((answer) => answer.text).join('\n')
      expect(person.memories).toHaveLength(3)
      for (const memory of person.memories) {
        expect(memoryDraftSchema.safeParse(memory).success).toBe(true)
        expect(memory.evidence.every((fragment) => answerText.includes(fragment))).toBe(true)
      }
    }
  })

  it('varies people across cities, answers, and availability', () => {
    expect(new Set(people.map((person) => person.cityKey)).size).toBe(2)
    expect(new Set(people.map((person) => person.answers[0]!.text)).size).toBeGreaterThan(5)
    expect(new Set(people.map((person) => person.name)).size).toBeGreaterThan(150)
    expect(
      new Set(people.map((person) => JSON.stringify(person.availability))).size,
    ).toBeGreaterThan(2)
    expect(people.every((person) => person.availability.length === 2)).toBe(true)
  })
})

describe('generatedPastEvents', () => {
  it('is deterministic and produces the requested number of events', () => {
    expect(pastEvents).toHaveLength(60)
    expect(generatedPastEvents(people, 60)).toEqual(pastEvents)
    expect(new Set(pastEvents.map((event) => event.eventId)).size).toBe(60)
  })

  it('groups two to five people from one city around a catalog activity', () => {
    for (const event of pastEvents) {
      expect(event.members.length).toBeGreaterThanOrEqual(2)
      expect(event.members.length).toBeLessThanOrEqual(5)
      expect(new Set(event.members).size).toBe(event.members.length)
      expect(event.members.every((id) => cityOf.get(id) === event.cityKey)).toBe(true)
      expect(activityById(event.activityId)?.name).toBe(event.activityName)
      expect(event.venueName.startsWith('(Demo) ')).toBe(true)
      expect(event.daysAgo).toBeGreaterThanOrEqual(3)
    }
  })

  it('never books a person twice on the same day', () => {
    const bookings = pastEvents.flatMap((event) =>
      event.members.map((id) => `${id}:${event.daysAgo}`),
    )
    expect(new Set(bookings).size).toBe(bookings.length)
  })

  it('records at most one answer per ordered pair, only between members', () => {
    for (const event of pastEvents) {
      const answers = [...event.yes, ...event.no]
      const pairs = answers.map(([author, subject]) => `${author}>${subject}`)
      expect(new Set(pairs).size).toBe(pairs.length)
      for (const [author, subject] of answers) {
        expect(author).not.toBe(subject)
        expect(event.members).toContain(author)
        expect(event.members).toContain(subject)
      }
    }
    expect(pastEvents.some((event) => event.yes.length > 0)).toBe(true)
    expect(pastEvents.some((event) => event.no.length > 0)).toBe(true)
  })

  it('skips events it cannot fill instead of inventing members', () => {
    expect(generatedPastEvents(people.slice(0, 1), 5)).toEqual([])
  })
})
