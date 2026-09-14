import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Block, Catalog } from '@/engine'
import { parseMageAnalysis, type ParsedAssignment } from '@/engine'

type MagePasteDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  catalog: Catalog
  blocks: Block[]
  onApply: (assignments: ParsedAssignment[]) => void
}

export function MagePasteDialog({
  open,
  onOpenChange,
  catalog,
  blocks,
  onApply,
}: MagePasteDialogProps) {
  const [text, setText] = useState('')
  const parsed = useMemo(
    () => (text.trim() ? parseMageAnalysis(text, blocks, catalog) : []),
    [text, blocks, catalog],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto">
        <DialogTitle>Pegar análisis Mage</DialogTitle>
        <DialogDescription>
          Best-effort: mapea cláusulas a bloques. Revisa y aplica. No hay endpoint real — pegas tú
          el texto del helper.
        </DialogDescription>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Pega aquí el análisis o el prompt que te devolvió Mage…"
          className="mt-3 min-h-32 w-full rounded-2xl border border-border bg-input px-3 py-2 text-[14px]"
        />
        <ul className="mt-3 space-y-2">
          {parsed.length === 0 ? (
            <li className="text-sm text-muted-foreground">Nada mapeado todavía.</li>
          ) : (
            parsed.map((item) => (
              <li
                key={`${item.blockId}-${item.optionId ?? item.custom}`}
                className="rounded-2xl border border-border px-3 py-2 text-[13px]"
              >
                <span className="font-medium" style={{ color: item.color }}>
                  {item.label}
                </span>
                <span className="text-paper/45"> · {item.confidence}</span>
                <p className="text-paper/80">{item.custom ?? item.optionId}</p>
              </li>
            ))
          )}
        </ul>
        <Button
          className="mt-3 w-full"
          disabled={parsed.length === 0}
          onClick={() => {
            onApply(parsed)
            onOpenChange(false)
          }}
        >
          Aplicar a bloques libres
        </Button>
      </DialogContent>
    </Dialog>
  )
}
