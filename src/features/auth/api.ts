import { z } from 'zod'
import { cookieJarFor } from '@/lib/cookies'
import { type Db, getDb } from '@/lib/db'
import { getEnv } from '@/lib/env'
import {
  HttpError,
  type RouteHandler,
  jsonResponse,
  readJson,
  requireSameOrigin,
  route,
} from '@/lib/http'
import { type SessionProvider, authedMutation, sessionProvider } from './session'

const credentialsSchema = z
  .object({ email: z.email(), password: z.string().min(8).max(72) })
  .strict()

export interface AuthRoutes {
  signUp: RouteHandler
  signIn: RouteHandler
  signOut: RouteHandler
}

export function authRoutes(getProvider: () => Promise<SessionProvider>): AuthRoutes {
  return {
    signUp: route(async (request) => {
      requireSameOrigin(request)
      const body = await readJson(request, credentialsSchema)
      const jar = cookieJarFor(request)
      const result = await (await getProvider()).signUp(jar, body.email, body.password)
      return jar.applyTo(jsonResponse(result, 201))
    }),
    signIn: route(async (request) => {
      requireSameOrigin(request)
      const body = await readJson(request, credentialsSchema)
      const jar = cookieJarFor(request)
      const userId = await (await getProvider()).signIn(jar, body.email, body.password)
      return jar.applyTo(jsonResponse({ userId }))
    }),
    signOut: authedMutation(async (request) => {
      const jar = cookieJarFor(request)
      await (await getProvider()).signOut(jar)
      return jar.applyTo(new Response(null, { status: 204 }))
    }, getProvider),
  }
}

/** Demo mode only: the seeded personas a visitor can sign in as with one tap. */
export function demoPersonasRoute(
  getDatabase: () => Promise<Db>,
  isDemo: () => boolean,
): RouteHandler {
  return route(async () => {
    if (!isDemo()) throw new HttpError(404, 'not_found', 'Not available')
    const db = await getDatabase()
    const personas = await db.query<{ email: string; name: string; city_name: string | null }>(
      `select u.email, p.name, p.city_name from auth.users u join profiles p on p.id = u.id
       where u.email like '%@convene.demo' order by p.name`,
    )
    return jsonResponse({
      personas: personas.map((row) => ({
        email: row.email,
        name: row.name,
        cityLabel: row.city_name,
      })),
    })
  })
}

const routes = authRoutes(sessionProvider)
export const signUp = routes.signUp
export const signIn = routes.signIn
export const signOut = routes.signOut
export const demoPersonas = demoPersonasRoute(getDb, () => getEnv().mode === 'demo')
