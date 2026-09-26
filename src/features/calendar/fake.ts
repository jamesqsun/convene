import { addLocalDays, localDateOf, localParts, zonedTime } from '@/lib/time'
import type { BusyBlock, CalendarEventInput, CalendarProvider, OAuthTokens } from './provider'

/**
 * Demo-mode calendar. "Connecting" completes instantly, two fictional calendars exist, and busy
 * time follows a fixed weekly pattern so the week grid has something to overlay. Events written
 * to the Convene calendar are kept in memory for inspection.
 */

export interface FakeCalendarProvider extends CalendarProvider {
  readonly writtenEvents: {
    calendarId: string
    externalEventId: string
    event: CalendarEventInput
  }[]
  readonly deletedEvents: string[]
}

export const fakeAccountEmail = 'you@gmail.demo'
export const fakeConveneCalendarId = 'convene-demo'

/** Weekly pattern per fictional calendar: [weekday (0 = Sunday), start clock, end clock, title]. */
const weeklyPattern: Record<string, [number[], string, string, string][]> = {
  primary: [
    [[6], '10:00', '12:00', 'Brunch with Sam'],
    [[3], '19:00', '20:00', 'Gym'],
    [[0], '18:00', '20:30', 'Family dinner'],
  ],
  work: [[[1, 2, 3, 4, 5], '09:30', '17:00', 'Work']],
}

function clockToParts(clock: string): [number, number] {
  const [h, m] = clock.split(':').map(Number)
  return [h!, m!]
}

export function fakeBusyBlocks(
  calendarIds: readonly string[],
  range: { from: number; to: number },
  timeZone: string,
): BusyBlock[] {
  const blocks: BusyBlock[] = []
  for (
    let date = localDateOf(timeZone, range.from);
    zonedTime(timeZone, date) < range.to;
    date = addLocalDays(date, 1)
  ) {
    const weekday = localParts(timeZone, zonedTime(timeZone, date, 12)).weekday
    for (const calendarId of calendarIds) {
      for (const [days, start, end, summary] of weeklyPattern[calendarId] ?? []) {
        if (!days.includes(weekday)) continue
        const [sh, sm] = clockToParts(start)
        const [eh, em] = clockToParts(end)
        const startsAt = zonedTime(timeZone, date, sh, sm)
        const endsAt = zonedTime(timeZone, date, eh, em)
        if (endsAt <= range.from || startsAt >= range.to) continue
        blocks.push({
          calendarId,
          externalId: `${calendarId}-${date}-${start}`,
          summary,
          startsAt,
          endsAt,
          isAllDay: false,
        })
      }
    }
  }
  return blocks
}

export function fakeCalendarProvider(): FakeCalendarProvider {
  const writtenEvents: FakeCalendarProvider['writtenEvents'] = []
  const deletedEvents: string[] = []
  let counter = 0
  return {
    kind: 'fake',
    writtenEvents,
    deletedEvents,
    authorizationUrl(redirectUri, state) {
      return `${redirectUri}?code=fake-code&state=${encodeURIComponent(state)}`
    },
    async exchangeCode(): Promise<OAuthTokens> {
      return {
        refreshToken: 'fake-refresh',
        accessToken: 'fake-access',
        expiresAt: Date.now() + 3_600_000,
        email: fakeAccountEmail,
      }
    },
    async refreshAccessToken() {
      return { accessToken: 'fake-access', expiresAt: Date.now() + 3_600_000 }
    },
    async listCalendars() {
      return [
        { id: 'primary', summary: 'Personal (fictional)', isPrimary: true, color: '#7986cb' },
        { id: 'work', summary: 'Work (fictional)', isPrimary: false, color: '#f6bf26' },
      ]
    },
    async listBusy(_accessToken, calendarIds, range, timeZone) {
      return fakeBusyBlocks(calendarIds, range, timeZone)
    },
    async ensureConveneCalendar() {
      return fakeConveneCalendarId
    },
    async createEvent(_accessToken, calendarId, event) {
      counter += 1
      const externalEventId = `fake-event-${counter}`
      writtenEvents.push({ calendarId, externalEventId, event })
      return externalEventId
    },
    async deleteEvent(_accessToken, _calendarId, externalEventId) {
      deletedEvents.push(externalEventId)
    },
  }
}
