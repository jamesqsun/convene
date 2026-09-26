/** Display formatting in a given IANA zone; the browser's own zone is never assumed. */

export function formatDateTime(instant: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(instant))
}

export function formatDate(instant: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date(instant))
}

export function formatTime(instant: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(
    new Date(instant),
  )
}

export function formatTimeRange(start: number, end: number, timeZone: string): string {
  return `${formatDate(start, timeZone)}, ${formatTime(start, timeZone)} to ${formatTime(end, timeZone)}`
}

export function daysBetween(earlier: number, later: number): number {
  return Math.max(0, Math.floor((later - earlier) / 86_400_000))
}

export function formatDaysAgo(instant: number, now: number): string {
  const days = daysBetween(instant, now)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days} days ago`
}

/** Short zone label such as "EDT", for making it obvious which clock a time refers to. */
export function zoneLabel(instant: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' }).formatToParts(
    new Date(instant),
  )
  return parts.find((part) => part.type === 'timeZoneName')?.value ?? timeZone
}
