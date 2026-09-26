'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export const navItems = [
  { href: '/availability', label: 'Availability' },
  { href: '/plans', label: 'Plans' },
  { href: '/hangouts', label: 'Hangouts' },
  { href: '/graph', label: 'Graph' },
  { href: '/profile', label: 'Profile' },
] as const

export function BottomNav() {
  const pathname = usePathname() ?? ''
  if (pathname.startsWith('/onboarding')) return null
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto flex max-w-lg justify-around">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={`block px-3 py-3 text-xs font-medium ${isActive ? 'text-emerald-700' : 'text-stone-500'}`}
              >
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
