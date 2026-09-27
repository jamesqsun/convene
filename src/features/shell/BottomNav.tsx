'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export const navItems = [
  { href: '/availability', label: 'Availability' },
  { href: '/plans', label: 'Plans' },
  { href: '/graph', label: 'Graph' },
  { href: '/profile', label: 'Profile' },
] as const

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

/** Primary navigation on phones; `SideNav` takes over from the md breakpoint. */
export function BottomNav() {
  const pathname = usePathname() ?? ''
  if (pathname.startsWith('/onboarding')) return null
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="mx-auto flex max-w-lg justify-around px-1 pt-2 pb-3">
        {navItems.map((item) => {
          const isActive = isActivePath(pathname, item.href)
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={`block rounded-[10px] px-3 py-1.5 text-xs font-bold transition-colors ${isActive ? 'bg-soft text-sage-deep' : 'text-muted hover:text-ink'}`}
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
