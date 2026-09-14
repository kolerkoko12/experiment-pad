import { useEffect, useId, useRef, useState } from 'react'

import type { GlossaryTerm } from '@/engine'
import { cn } from '@/lib/utils'

type GlossaryTipProps = {
  term: GlossaryTerm | undefined
  /** Visual mark. ⓘ is easier to tap on iPad than a tiny ?. */
  mark?: 'info' | 'question'
  className?: string
}

export function GlossaryTip({ term, mark = 'info', className }: GlossaryTipProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLSpanElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!term) return null

  return (
    <span ref={rootRef} className={cn('relative inline-flex', className)}>
      <button
        type="button"
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-white/20 text-[13px] leading-none text-paper/75"
        aria-label={`Qué es ${term.term}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        {mark === 'question' ? '?' : 'ⓘ'}
      </button>
      {open ? (
        <span
          id={panelId}
          role="tooltip"
          className="absolute top-12 left-1/2 z-30 w-[min(18rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-border bg-popover px-3 py-2 text-[13px] leading-snug text-paper shadow-xl"
        >
          <strong className="block text-[11px] tracking-wide uppercase">{term.term}</strong>
          {term.text}
        </span>
      ) : null}
    </span>
  )
}

export function termById(terms: GlossaryTerm[], id: string): GlossaryTerm | undefined {
  return terms.find((item) => item.id === id)
}

export function termOrFallback(
  terms: GlossaryTerm[] | undefined,
  id: string,
  fallback: GlossaryTerm,
): GlossaryTerm {
  return termById(terms ?? [], id) ?? fallback
}
