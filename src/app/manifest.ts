import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Convene',
    short_name: 'Convene',
    description: 'You give Convene time. Convene turns it into plans.',
    start_url: '/availability',
    display: 'standalone',
    background_color: '#f5f5f5',
    theme_color: '#f5f5f5',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
