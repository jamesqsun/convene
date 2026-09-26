import { readFileSync } from 'node:fs'

/** Minimal .env.local reader for scripts that run outside Next.js. Existing variables win. */
export function loadDotEnvLocal(path = '.env.local'): void {
  let text = ''
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    return
  }
  for (const line of text.split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
    if (match && process.env[match[1]!] === undefined)
      process.env[match[1]!] = match[2]!.replace(/^"|"$/g, '')
  }
}
