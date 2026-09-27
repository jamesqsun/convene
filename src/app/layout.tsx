import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import './globals.css'

// Vendored (SIL OFL, see ./fonts) so builds stay offline-capable.
const nunito = localFont({
  src: './fonts/nunito-latin-wght.woff2',
  weight: '200 1000',
  variable: '--font-nunito',
  display: 'swap',
})
const fraunces = localFont({
  src: './fonts/fraunces-latin-wght.woff2',
  weight: '100 900',
  variable: '--font-fraunces',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Convene',
  description: 'You give Convene time. Convene turns it into plans.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Convene', statusBarStyle: 'default' },
}

export const viewport: Viewport = {
  themeColor: '#f5f5f5',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${nunito.variable} ${fraunces.variable}`}>
      <body>{children}</body>
    </html>
  )
}
