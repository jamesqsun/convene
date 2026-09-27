import { InterestsPage } from '@/features/interests/InterestsPage'
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <InterestsPage promptId={id} />
}
