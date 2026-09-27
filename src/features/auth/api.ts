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
  startGoogleSignIn: RouteHandler
  completeGoogleSignIn: RouteHandler
  signOut: RouteHandler
}

function redirectResponse(location: string): Response {
  return new Response(null, { status: 302, headers: { location } })
}

function googleCallbackUri(request: Request): string {
  return `${new URL(request.url).origin}/api/auth/google/callback`
}

/** Both Google routes are browser navigations, so failures return to the sign-in page. */
function googleFailureResponse(error: unknown): Response {
  if (!(error instanceof HttpError)) throw error
  console.error('[auth] Google sign-in failed:', error.code, error.message)
  return redirectResponse(`/sign-in?error=${error.code}`)
}

export function authRoutes(getProvider: () => Promise<SessionProvider>): AuthRoutes {
  return {
    startGoogleSignIn: route(async (request) => {
      const jar = cookieJarFor(request)
      try {
        const provider = await getProvider()
        const consentUrl = await provider.startGoogleSignIn(jar, googleCallbackUri(request))
        return jar.applyTo(redirectResponse(consentUrl))
      } catch (error) {
        return googleFailureResponse(error)
      }
    }),
    completeGoogleSignIn: route(async (request) => {
      const code = new URL(request.url).searchParams.get('code')
      if (!code) return redirectResponse('/sign-in?error=google_failed')
      const jar = cookieJarFor(request)
      try {
        await (await getProvider()).completeGoogleSignIn(jar, code)
        return jar.applyTo(redirectResponse('/availability'))
      } catch (error) {
        return googleFailureResponse(error)
      }
    }),
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
export const startGoogleSignIn = routes.startGoogleSignIn
export const completeGoogleSignIn = routes.completeGoogleSignIn
export const signOut = routes.signOut
export const demoPersonas = demoPersonasRoute(getDb, () => getEnv().mode === 'demo')
