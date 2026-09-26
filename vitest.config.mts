import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // Next.js needs `jsx: preserve` in tsconfig; tests need JSX compiled.
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'supabase/**/*.test.ts'],
    // PGlite boots a WASM Postgres per test file; give it room.
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
})
