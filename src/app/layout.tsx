import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Convene',
  description: 'You give Convene time. Convene turns it into plans.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Convene', statusBarStyle: 'default' },
}

export const viewport: Viewport = {
  themeColor: '#1c1917',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
