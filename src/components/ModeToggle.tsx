import { Dices, SlidersHorizontal } from 'lucide-react'

import type { StudioMode } from '@/engine'
import { cn } from '@/lib/utils'

type ModeToggleProps = {
  mode: StudioMode
  onChange: (mode: StudioMode) => void
}

export function ModeToggle({ mode, onChange }: ModeToggleProps) {
  return (
    <div className="grid grid-cols-2 gap-2 rounded-[22px] bg-black/35 p-1.5">
      <button
        type="button"
        onClick={() => onChange('experimental')}
        className={cn(
          'flex min-h-12 items-center justify-center gap-2 rounded-2xl text-sm font-medium',
          mode === 'experimental'
            ? 'bg-rose-400 text-ink shadow'
            : 'text-paper/60',
        )}
      >
        <Dices className="size-4" />
        Experimental
      </button>
      <button
        type="button"
        onClick={() => onChange('control')}
        className={cn(
          'flex min-h-12 items-center justify-center gap-2 rounded-2xl text-sm font-medium',
          mode === 'control' ? 'bg-teal-300 text-ink shadow' : 'text-paper/60',
        )}
      >
        <SlidersHorizontal className="size-4" />
        Control
      </button>
    </div>
  )
}
