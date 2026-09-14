import { useState } from 'react'

import { Button } from '@/components/ui/button'
import type { Block, OptionDef } from '@/engine'
import { tint } from '@/lib/utils'

type OptionSheetProps = {
  block: Block | null
  options: OptionDef[]
  onClose: () => void
  onPick: (optionId: string) => void
  onCustom: (text: string) => void
}

export function OptionSheet({ block, options, onClose, onPick, onCustom }: OptionSheetProps) {
  if (!block) return null
  return (
    <OptionSheetBody
      key={block.id + (block.value?.kind === 'custom' ? block.value.text : block.value?.optionId ?? '')}
      block={block}
      options={options}
      onClose={onClose}
      onPick={onPick}
      onCustom={onCustom}
    />
  )
}

function OptionSheetBody({
  block,
  options,
  onClose,
  onPick,
  onCustom,
}: {
  block: Block
  options: OptionDef[]
  onClose: () => void
  onPick: (optionId: string) => void
  onCustom: (text: string) => void
}) {
  const [custom, setCustom] = useState(block.value?.kind === 'custom' ? block.value.text : '')

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end bg-black/65 backdrop-blur-sm">
      <button type="button" className="min-h-16 flex-1" aria-label="Cerrar" onClick={onClose} />
      <div
        className="max-h-[78vh] overflow-hidden rounded-t-[28px] border-t border-border bg-popover pb-[max(1rem,env(safe-area-inset-bottom))]"
        style={{ boxShadow: `0 -12px 40px ${tint(block.color, 0.18)}` }}
      >
        <div className="sticky top-0 z-10 border-b border-border bg-popover/95 px-4 pt-3 pb-3 backdrop-blur">
          <div className="mx-auto mb-3 h-1 w-12 rounded-full bg-white/20" />
          <p
            className="text-[11px] font-semibold tracking-[0.16em] uppercase"
            style={{ color: block.color }}
          >
            {block.label}
          </p>
          <h2 className="font-display text-2xl tracking-tight">Editar bloque libre</h2>
        </div>
        <div className="max-h-[52vh] space-y-2 overflow-y-auto px-3 py-3">
          {options.map((option) => {
            const active = block.value?.kind === 'option' && block.value.optionId === option.id
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => onPick(option.id)}
                className="w-full rounded-2xl border px-3 py-3 text-left active:scale-[0.99]"
                style={{
                  borderColor: active ? block.color : 'rgba(255,255,255,0.08)',
                  background: active ? tint(block.color, 0.16) : 'rgba(255,255,255,0.03)',
                }}
              >
                <p className="text-[15px] text-paper">{option.label}</p>
                <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
                  {option.prompt}
                </p>
              </button>
            )
          })}
        </div>
        <form
          className="flex gap-2 border-t border-border px-3 pt-3"
          onSubmit={(event) => {
            event.preventDefault()
            if (custom.trim()) onCustom(custom.trim())
          }}
        >
          <input
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
            placeholder="Texto propio en inglés…"
            className="min-h-12 flex-1 rounded-2xl border border-border bg-input px-3 text-[15px] outline-none"
          />
          <Button type="submit" disabled={!custom.trim()}>
            Usar
          </Button>
        </form>
      </div>
    </div>
  )
}
