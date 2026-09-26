/**
 * End-to-end smoke test against a running demo-mode server. Exercises the real HTTP routes with
 * cookies, from persona sign-in through planning, withdrawal, feedback, onboarding, and memory
 * editing. Refuses to run against a connected-mode server so it can never mutate live data.
 *
 * Usage: CONVENE_SMOKE_URL=http://localhost:3000 pnpm smoke
 */

const baseUrl = process.env.CONVENE_SMOKE_URL ?? 'http://localhost:3000'
const requestOrigin = new URL(baseUrl).origin

class Session {
  private cookies = new Map<string, string>()

  async call<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    expected = 200,
  ): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        origin: requestOrigin,
        cookie: [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; '),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    for (const header of response.headers.getSetCookie()) {
      const [pair] = header.split(';')
      const [name, value] = pair!.split('=')
      if (name && value !== undefined) this.cookies.set(name, value)
    }
    const text = await response.text()
    if (response.status !== expected)
      throw new Error(
        `${method} ${path} -> ${response.status} (expected ${expected}): ${text.slice(0, 300)}`,
      )
    return (text ? JSON.parse(text) : undefined) as T
  }
}

function check(condition: unknown, label: string): void {
  if (!condition) throw new Error(`Check failed: ${label}`)
  console.log(`  ok  ${label}`)
}

interface State {
  mode: string
  slots: { id: string; state: string; assignedEventId: string | null }[]
  plans: {
    eventId: string
    status: string
    participants: { name: string; phone: string | null }[]
    venue: { provider: string }
    explanation: string
    canWithdraw: boolean
  }[]
  hangouts: {
    eventId: string
    people: { userId: string; name: string; myAnswer: string | null; isMutualFriend: boolean }[]
  }[]
  profile: { userId: string; timezone: string | null }
}

async function personaFlow(): Promise<void> {
  console.log('Persona flow (Maya)')
  const maya = new Session()
  const { personas } = await maya.call<{ personas: { email: string; name: string }[] }>(
    'GET',
    '/api/auth/demo-personas',
  )
  check(
    personas.some((p) => p.email === 'maya@convene.demo'),
    'demo personas are listed',
  )
  await maya.call('POST', '/api/auth/sign-in', {
    email: 'maya@convene.demo',
    password: 'demo-password',
  })
  let state = await maya.call<State>('GET', '/api/state')
  check(state.mode === 'demo', 'server is in demo mode')
  check(
    state.slots.some((s) => s.state === 'waiting'),
    'seeded availability is waiting for its batch',
  )
  check(state.hangouts.length === 2, 'two seeded past hangouts are visible')
  await maya.call(
    'POST',
    '/api/availability',
    { date: '2026-01-01', startTime: '18:00', endTime: '21:00' },
    422,
  )
  console.log('  ok  availability in the past is rejected as too soon')

  const summary = await maya.call<{
    batches: { groups: { status: string }[] }[]
    notifications: { claimed: number }
  }>('POST', '/api/demo/run-jobs')
  const committed = summary.batches.flatMap((b) => b.groups).filter((g) => g.status === 'committed')
  check(committed.length >= 1, `planning committed ${committed.length} group(s)`)
  state = await maya.call<State>('GET', '/api/state')
  const plan = state.plans.find((p) => p.status === 'scheduled')
  check(plan !== undefined, 'Maya has an assigned plan')
  check(
    plan!.participants.every((p) => p.phone?.startsWith('+1')),
    'co-participant phones are visible in the plan',
  )
  check(plan!.venue.provider === 'fictional', 'venue is the labelled fictional provider')
  check(plan!.explanation.length > 0, 'plan carries an explanation')
  check(
    state.slots.some((s) => s.state === 'assigned' && s.assignedEventId === plan!.eventId),
    'the source slot shows as assigned',
  )
  const detail = await maya.call<{ plan: { participants: unknown[] } }>(
    'GET',
    `/api/plans/${plan!.eventId}`,
  )
  check(detail.plan.participants.length >= 2, 'plan detail lists at least two people')

  const withdrawal = await maya.call<{ result: string }>(
    'POST',
    `/api/plans/${plan!.eventId}/withdraw`,
  )
  check(
    ['withdrawn', 'event_cancelled'].includes(withdrawal.result),
    `withdrawal result: ${withdrawal.result}`,
  )
  await maya.call('GET', `/api/plans/${plan!.eventId}`, undefined, 404)
  console.log('  ok  withdrawn user can no longer read the plan')

  const h1 = state.hangouts.find((h) => h.people.length === 2)!
  const chloe = h1.people.find((p) => p.name.startsWith('Chloe'))!
  const ben = h1.people.find((p) => p.name.startsWith('Ben'))!
  await maya.call(
    'POST',
    '/api/feedback',
    { eventId: h1.eventId, subjectUserId: chloe.userId, answer: 'yes' },
    409,
  )
  console.log('  ok  a finalized answer cannot be changed')
  const again = await maya.call<{ isMutualFriend: boolean }>('POST', '/api/feedback', {
    eventId: h1.eventId,
    subjectUserId: ben.userId,
    answer: 'yes',
  })
  check(again.isMutualFriend, 'repeating a yes is idempotent and shows the mutual friendship')
  const graph = await maya.call<{ nodes: { name: string; isFriend: boolean }[] }>(
    'GET',
    '/api/graph',
  )
  check(graph.nodes.filter((n) => n.isFriend).length === 2, 'graph shows two friends')
  await maya.call('POST', '/api/auth/sign-out', undefined, 204)
  await maya.call('GET', '/api/state', undefined, 401)
  console.log('  ok  signed out')
}

async function newcomerFlow(): Promise<void> {
  console.log('Newcomer flow')
  const email = `smoke-${Date.now()}@example.test`
  const user = new Session()
  await user.call('POST', '/api/auth/sign-up', { email, password: 'password123' }, 201)
  let profile = await user.call<{ profile: { onboardingStep: string } }>('GET', '/api/profile')
  check(profile.profile.onboardingStep === 'basics', 'fresh profile starts at basics')
  await user.call('PATCH', '/api/profile', { name: 'Smoke Tester', age: 30, budget: 20 }, 400)
  console.log('  ok  removed controls are rejected by the profile contract')
  await user.call('PATCH', '/api/profile', { name: 'Smoke Tester', age: 30 })
  const cities = await user.call<{ matches: { key: string }[] }>('GET', '/api/cities?q=toronto')
  await user.call('PATCH', '/api/profile', { cityKey: cities.matches[0]!.key })
  await user.call('PATCH', '/api/profile', {
    phone: '+1 416 555 0199',
    interests: ['coffee', 'hiking'],
  })
  profile = await user.call('PATCH', '/api/profile', {
    answers: [
      {
        promptId: 'weekend',
        text: 'A long hike, then coffee somewhere quiet and unhurried, with a book.',
      },
      {
        promptId: 'meeting_people',
        text: 'Small groups and a shared activity make it easy for me to talk.',
      },
      {
        promptId: 'try_new',
        text: 'Bouldering, as long as nobody expects me to be good at it at first.',
      },
    ],
  })
  check(profile.profile.onboardingStep === 'done', 'onboarding completes after the answers')
  const generated = await user.call<{ status: string; memories: { id: string }[] }>(
    'POST',
    '/api/memories/generate',
  )
  check(
    generated.status === 'ok' && generated.memories.length > 0,
    `generated ${generated.memories.length} memories`,
  )
  const [memory] = generated.memories
  const edited = await user.call<{ memory: { topic: string; editedAt: number | null } }>(
    'PATCH',
    `/api/memories/${memory!.id}`,
    { topic: 'Quiet cafes', attributes: { setting: 'quiet' } },
  )
  check(
    edited.memory.topic === 'Quiet cafes' && edited.memory.editedAt !== null,
    'memory edit persists and is marked edited',
  )
  await user.call('DELETE', `/api/memories/${memory!.id}`, undefined, 204)
  const remaining = await user.call<{ memories: unknown[] }>('GET', '/api/memories')
  check(remaining.memories.length === generated.memories.length - 1, 'memory delete removes it')
  const slot = await user.call<{ slot: { state: string } }>(
    'POST',
    '/api/availability',
    { date: '2026-10-10', startTime: '18:00', endTime: '21:00' },
    201,
  )
  check(
    slot.slot.state === 'waiting',
    'new availability waits for its batch instead of planning immediately',
  )
  const key = await user.call<{ publicKey: string | null }>('GET', '/api/push/public-key')
  check(typeof key.publicKey === 'string', 'a VAPID public key is available in demo mode')
}

async function pages(): Promise<void> {
  console.log('Pages')
  for (const path of [
    '/sign-in',
    '/availability',
    '/manifest.webmanifest',
    '/sw.js',
    '/icons/icon-192.png',
  ]) {
    const response = await fetch(`${baseUrl}${path}`)
    check(response.ok, `${path} responds ${response.status}`)
  }
}

async function main(): Promise<void> {
  const probe = await fetch(`${baseUrl}/api/auth/demo-personas`)
  if (probe.status !== 200)
    throw new Error(
      'Smoke tests only run against a demo-mode server (demo personas route must be available)',
    )
  await personaFlow()
  await newcomerFlow()
  await pages()
  console.log('Smoke test passed.')
}

main().catch((error) => {
  console.error('Smoke test failed:', error.message)
  process.exit(1)
})
