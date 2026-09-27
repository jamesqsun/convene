/**
 * Notification content. Deliberately minimal: activity, when, where, and a link. Never a phone
 * number or anything about other participants.
 */

export type NotificationType = 'assignment' | 'participant_left' | 'cancellation' | 'feedback_reminder'

export interface NotifiableEvent {
  id: string
  activityName: string
  startsAt: number
  timezone: string
  venueName: string
}

export interface NotificationPayload {
  title: string
  body: string
  url: string
  tag: string
}

export function formatLocalStart(event: Pick<NotifiableEvent, 'startsAt' | 'timezone'>): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: event.timezone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(event.startsAt))
}

export function notificationPayload(
  type: NotificationType,
  event: NotifiableEvent,
  remaining: number | null = null,
): NotificationPayload {
  const when = formatLocalStart(event)
  const url = `/plans/${event.id}`
  const tag = `${type}:${event.id}`
  switch (type) {
    case 'feedback_reminder':
      return {
        title: 'How was your hangout?',
        body: `Share your feedback on ${event.activityName} and tell us who you would like to meet again.`,
        url,
        tag,
      }
    case 'assignment':
      return {
        title: `Plan assigned: ${event.activityName}`,
        body: `${when} at ${event.venueName}`,
        url,
        tag,
      }
    case 'participant_left':
      return {
        title: 'Someone left your plan',
        body: `${remaining ?? 'Fewer'} people are still going to ${event.activityName.toLowerCase()} on ${when}.`,
        url,
        tag,
      }
    case 'cancellation':
      return {
        title: 'Plan cancelled',
        body: `${event.activityName} on ${when} was cancelled because only one person remained.`,
        url,
        tag,
      }
  }
}
