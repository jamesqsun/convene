import { timingSafeEqual } from 'node:crypto'
import { z, type ZodType } from 'zod'

/**
 * Shared plumbing for route handlers: JSON responses, a typed error, strict input parsing with a
 * size cap, the same-origin guard for cookie-authenticated mutations, and the wrappers that turn
 * thrown errors into JSON error responses.
 */

export class HttpError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

export function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status })
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): Response {
  return Response.json(
    { error: { code, message, ...(details === undefined ? {} : { details }) } },
    { status },
  )
}

export const maxJsonBytes = 64 * 1024

/** Parses a JSON body against a strict Zod schema. Unknown fields are rejected, not ignored. */
export async function readJson<T>(request: Request, schema: ZodType<T>): Promise<T> {
  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > maxJsonBytes)
    throw new HttpError(413, 'payload_too_large', 'Request body is too large')
  const text = await request.text()
  if (text.length > maxJsonBytes)
    throw new HttpError(413, 'payload_too_large', 'Request body is too large')
  let parsedJson: unknown
  try {
    parsedJson = text === '' ? {} : JSON.parse(text)
  } catch {
    throw new HttpError(400, 'invalid_json', 'Request body is not valid JSON')
  }
  const result = schema.safeParse(parsedJson)
  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }))
    throw new HttpError(400, 'invalid_input', z.prettifyError(result.error), issues)
  }
  return result.data
}

/**
 * Cookie-authenticated mutations must come from our own pages. Browsers always send `Origin` on
 * cross-origin and same-origin POST/PATCH/DELETE fetches, so a missing header is treated as foreign.
 */
export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get('origin')
  const host = request.headers.get('host') ?? new URL(request.url).host
  if (!origin) throw new HttpError(403, 'origin_required', 'Cross-origin request rejected')
  let originHost: string
  try {
    originHost = new URL(origin).host
  } catch {
    throw new HttpError(403, 'origin_required', 'Cross-origin request rejected')
  }
  if (originHost !== host) throw new HttpError(403, 'cross_origin', 'Cross-origin request rejected')
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') ?? ''
  return header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : null
}

/** Constant-time comparison so secret checks do not leak length or prefix information. */
export function isSameSecret(candidate: string | null, expected: string): boolean {
  if (candidate === null) return false
  const a = Buffer.from(candidate)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export interface RouteContext<Params> {
  params: Promise<Params>
}

export type RouteHandler<Params = Record<string, never>> = (
  request: Request,
  context: RouteContext<Params>,
) => Promise<Response>

/** Wraps a handler so HttpErrors become JSON and anything else becomes a logged 500. */
export function route<Params>(fn: RouteHandler<Params>): RouteHandler<Params> {
  return async (request, context) => {
    try {
      return await fn(request, context)
    } catch (error) {
      if (error instanceof HttpError) {
        return errorResponse(error.status, error.code, error.message, error.details)
      }
      console.error(`[${request.method} ${new URL(request.url).pathname}]`, error)
      return errorResponse(500, 'internal_error', 'Something went wrong')
    }
  }
}

export type UserResolver = (request: Request) => Promise<string | null>

export type AuthedHandler<Params> = (
  request: Request,
  userId: string,
  params: Params,
) => Promise<Response>

/** Requires a signed-in user; `resolveUser` is injected so the HTTP layer stays auth-provider agnostic. */
export function withUser<Params>(
  resolveUser: UserResolver,
  fn: AuthedHandler<Params>,
): RouteHandler<Params> {
  return route(async (request, context) => {
    const userId = await resolveUser(request)
    if (!userId) throw new HttpError(401, 'unauthenticated', 'Sign in required')
    return fn(request, userId, await context.params)
  })
}

/** Same as withUser, plus the same-origin guard every cookie-authenticated mutation needs. */
export function withUserMutation<Params>(
  resolveUser: UserResolver,
  fn: AuthedHandler<Params>,
): RouteHandler<Params> {
  return withUser(resolveUser, (request, userId, params) => {
    requireSameOrigin(request)
    return fn(request, userId, params)
  })
}

export const noParams: RouteContext<Record<string, never>> = { params: Promise.resolve({}) }
