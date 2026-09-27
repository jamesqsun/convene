import { logoArc, logoArrow, logoDashes, logoStrokeWidth, logoViewBox } from './logo-mark'

/** The Convene mark in the current text colour. Decorative unless given a `title`. */
export function LogoMark({
  className = 'size-7 text-sage-deep',
  title,
}: {
  className?: string
  title?: string
}) {
  return (
    <svg
      viewBox={logoViewBox}
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <path
        d={logoArc}
        fill="none"
        stroke="currentColor"
        strokeWidth={logoStrokeWidth}
        strokeLinecap="round"
        strokeDasharray={logoDashes}
      />
      <path
        d={logoArrow}
        fill="currentColor"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Mark and Fraunces wordmark side by side, sized by the wrapper's font size. */
export function Logo({ className = 'text-[22px]' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-[0.35em] ${className}`}>
      <LogoMark className="size-[1.25em] text-sage-deep" />
      <span className="font-display leading-none font-semibold tracking-tight text-ink">
        Convene
      </span>
    </span>
  )
}
