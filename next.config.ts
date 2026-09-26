import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Native/WASM packages must be loaded with Node's require, not bundled by Turbopack.
  serverExternalPackages: ['@electric-sql/pglite', '@electric-sql/pglite-pgvector', 'web-push'],
  async headers() {
    return [
      {
        // The service worker must never be served from a stale cache.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ]
  },
}

export default nextConfig
