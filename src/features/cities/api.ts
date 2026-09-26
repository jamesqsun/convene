import { z } from 'zod'
import { HttpError, type RouteHandler, type UserResolver, jsonResponse, withUser } from '@/lib/http'
import { authed } from '@/features/auth/session'
import { searchCities } from './search'

const querySchema = z.string().trim().min(2).max(60)

/** GET /api/cities?q=: server-side city picker so the dataset never ships to the browser. */
export function citiesRoute(resolveUser: UserResolver): RouteHandler {
  return withUser(resolveUser, async (request) => handle(request))
}

async function handle(request: Request): Promise<Response> {
  const query = querySchema.safeParse(new URL(request.url).searchParams.get('q') ?? '')
  if (!query.success) throw new HttpError(400, 'invalid_input', 'q must be 2 to 60 characters')
  return jsonResponse({ matches: searchCities(query.data) })
}

export const GET = authed(async (request) => handle(request))
