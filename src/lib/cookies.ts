/**
 * A per-request cookie jar: reads the request's cookies and collects cookies to set, then applies
 * them to the outgoing response. Shared by the Supabase SSR client and the demo session.
 */

export interface CookieOptions {
  path?: string
  domain?: string
  maxAge?: number
  expires?: Date
  httpOnly?: boolean
  secure?: boolean
  sameSite?: boolean | 'lax' | 'strict' | 'none'
}

export interface CookieToSet {
  name: string
  value: string
  options?: CookieOptions
}

export interface CookieJar {
  getAll(): { name: string; value: string }[]
  setAll(cookies: CookieToSet[]): void
  /** Copies every collected Set-Cookie onto the response and returns it. */
  applyTo<R extends Response>(response: R): R
}

export function parseCookieHeader(header: string | null): { name: string; value: string }[] {
  if (!header) return []
  return header
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.includes('='))
    .map((part) => {
      const index = part.indexOf('=')
      return {
        name: part.slice(0, index).trim(),
        value: decodeURIComponent(part.slice(index + 1).trim()),
      }
    })
}

export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  const parts = [`${name}=${encodeURIComponent(value)}`]
  parts.push(`Path=${options.path ?? '/'}`)
  if (options.domain) parts.push(`Domain=${options.domain}`)
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(options.maxAge)}`)
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`)
  if (options.httpOnly) parts.push('HttpOnly')
  if (options.secure) parts.push('Secure')
  const sameSite = options.sameSite === true ? 'strict' : options.sameSite
  if (sameSite) parts.push(`SameSite=${sameSite.charAt(0).toUpperCase()}${sameSite.slice(1)}`)
  return parts.join('; ')
}

export function cookieJarFor(request: Request): CookieJar {
  const incoming = parseCookieHeader(request.headers.get('cookie'))
  const pending: CookieToSet[] = []
  return {
    getAll: () => [...incoming, ...pending.map(({ name, value }) => ({ name, value }))],
    setAll: (cookies) => pending.push(...cookies),
    applyTo(response) {
      for (const cookie of pending) {
        response.headers.append(
          'set-cookie',
          serializeCookie(cookie.name, cookie.value, cookie.options),
        )
      }
      return response
    },
  }
}
