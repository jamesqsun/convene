import { PlanDetailPage } from '@/features/events/PlanDetailPage'

export default async function Page({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  return <PlanDetailPage eventId={eventId} />
}
