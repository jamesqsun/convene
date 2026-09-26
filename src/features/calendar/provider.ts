/**
 * Calendar integration contract. Google in connected mode, a deterministic fake in demo mode.
 * Access tokens are passed in by the store layer, which owns refresh and encryption.
 */

export interface CalendarInfo {
  id: string
  summary: string
  isPrimary: boolean
  color: string | null
}

export interface BusyBlock {
  calendarId: string
  externalId: string
  summary: string
  startsAt: number
  endsAt: number
  isAllDay: boolean
}

export interface CalendarEventInput {
  summary: string
  description: string
  location: string
  startsAt: number
  endsAt: number
  timeZone: string
}

export interface OAuthTokens {
  refreshToken: string
  accessToken: string
  expiresAt: number
  email: string
}

export interface CalendarProvider {
  readonly kind: 'google' | 'fake'
  authorizationUrl(redirectUri: string, state: string): string
  exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens>
  refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: number }>
  listCalendars(accessToken: string): Promise<CalendarInfo[]>
  /** Busy intervals from the given calendars; all-day dates resolve in `timeZone`. */
  listBusy(
    accessToken: string,
    calendarIds: readonly string[],
    range: { from: number; to: number },
    timeZone: string,
  ): Promise<BusyBlock[]>
  /** Returns the id of the person's "Convene" calendar, creating it when missing. */
  ensureConveneCalendar(
    accessToken: string,
    timeZone: string,
    existingId: string | null,
  ): Promise<string>
  createEvent(accessToken: string, calendarId: string, event: CalendarEventInput): Promise<string>
  deleteEvent(accessToken: string, calendarId: string, externalEventId: string): Promise<void>
}

export const conveneCalendarName = 'Convene'

export class CalendarApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}
