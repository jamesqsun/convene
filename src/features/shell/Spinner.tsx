/** A small ring spinner in the current text colour; decorative, so pair it with visible text. */
export function Spinner({ className = 'size-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={`animate-spin ${className}`}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export interface SubmitButtonProps {
  isBusy: boolean
  busyLabel: string
  disabled?: boolean
  className?: string
  children: React.ReactNode
}

/** A submit button that shows a spinner and a busy label while its form is saving. */
export function SubmitButton({
  isBusy,
  busyLabel,
  disabled,
  className = 'btn btn-primary',
  children,
}: SubmitButtonProps) {
  return (
    <button
      type="submit"
      disabled={disabled || isBusy}
      aria-busy={isBusy || undefined}
      // Busy is not the same as unavailable: keep full strength so the spinner reads as progress.
      className={`${className} ${isBusy ? 'disabled:cursor-progress disabled:opacity-100' : ''}`}
    >
      {isBusy && <Spinner />}
      {isBusy ? busyLabel : children}
    </button>
  )
}
