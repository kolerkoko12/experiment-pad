import { useState } from 'react'

import type { GlossaryTerm } from '@/engine'

export function GlossaryTip({ term }: { term: GlossaryTerm | undefined }) {
  const [open, setOpen] = useState(false)
  if (!term) return null
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        className="ml-1 inline-flex size-6 items-center justify-center rounded-full border border-white/20 text-[11px] text-paper/70"
        aria-label={`Qué es ${term.term}`}
        onClick={() => setOpen((value) => !value)}
      >
        ?
      </button>
      {open ? (
        <span className="absolute top-7 left-0 z-20 w-56 rounded-2xl border border-border bg-popover px-3 py-2 text-[12px] leading-snug text-paper shadow-xl">
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
