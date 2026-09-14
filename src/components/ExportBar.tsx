import { ClipboardCopy, ExternalLink, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { GlossaryTip, termById } from '@/components/GlossaryTip'
import type { Catalog } from '@/engine'

type ExportBarProps = {
  catalog: Catalog
  disabled: boolean
  onDirect: () => void
  onPromptbox: () => void
  onAssistant: () => void
  onAnalysis: () => void
}

export function ExportBar({
  catalog,
  disabled,
  onDirect,
  onPromptbox,
  onAssistant,
  onAnalysis,
}: ExportBarProps) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <Button size="lg" className="bg-teal-300 text-ink" disabled={disabled} onClick={onDirect}>
          <ClipboardCopy />
          Directo
        </Button>
        <Button size="lg" variant="secondary" disabled={disabled} onClick={onPromptbox}>
          <ClipboardCopy />
          Promptbox
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-2">
        <Button variant="outline" disabled={disabled} onClick={onAssistant}>
          <Sparkles />
          Copiar · abrir destino (stub)
        </Button>
        <Button variant="outline" disabled={disabled} onClick={onAnalysis}>
          <ExternalLink />
          Análisis avanzado (stub)
        </Button>
      </div>
      <p className="flex items-start gap-1 text-[11px] leading-snug text-muted-foreground">
        <GlossaryTip term={termById(catalog.glossary, 'promptbox')} />
        Directo = Prompt Final (o ensamblado). Promptbox = una cláusula por línea. El envío Comfy
        con refs/base64 se cablea en el siguiente lote; mage.json sigue cargando sin romper el
        build.
      </p>
    </div>
  )
}
