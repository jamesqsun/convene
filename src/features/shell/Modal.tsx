'use client'

import { useEffect } from 'react'

export interface ModalProps {
  isOpen: boolean
  onClose: () => void
  ariaLabel: string
  children?: React.ReactNode
}

/** A bottom sheet on phones, a centered dialog on wider screens. Closes on backdrop click or Escape. */
export function Modal({ isOpen, onClose, ariaLabel, children }: ModalProps) {
  useEffect(() => {
    if (!isOpen) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      className="fixed inset-0 z-20 flex items-end justify-center bg-ink/40 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-[22px] bg-surface p-5 shadow-xl shadow-ink/10 sm:rounded-[22px] md:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="float-right rounded-full px-2 py-1 text-lg leading-none font-bold text-muted/70 hover:bg-linen hover:text-muted"
        >
          ×
        </button>
        {children}
      </div>
    </div>
  )
}
