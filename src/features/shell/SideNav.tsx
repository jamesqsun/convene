'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { isActivePath, navItems } from './BottomNav'

/** Primary navigation from the md breakpoint up: brand, destinations, and the tagline. */
export function SideNav() {
  const pathname = usePathname() ?? ''
  if (pathname.startsWith('/onboarding')) return null
  return (
    <aside className="sticky top-0 hidden h-screen flex-col border-r border-line bg-[color-mix(in_srgb,var(--color-surface)_60%,var(--color-linen))] px-4 py-6 md:flex">
      <a href="/availability" className="flex items-center gap-2.5 px-2 pb-6">
        <span className="mark" aria-hidden="true" />
        <span className="font-display text-[22px] font-semibold tracking-tight">Convene</span>
      </a>
      <nav aria-label="Primary">
        <ul className="flex flex-col gap-1">
          {navItems.map((item) => {
            const isActive = isActivePath(pathname, item.href)
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={`block rounded-xl px-3 py-2.5 text-sm font-extrabold transition-colors ${isActive ? 'bg-soft text-sage-deep' : 'text-muted hover:bg-surface hover:text-ink'}`}
                >
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
      <p className="mt-auto px-2 text-xs leading-relaxed text-muted">
        You give Convene time.
        <br />
        Convene turns it into plans.
      </p>
    </aside>
  )
}
