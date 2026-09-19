import { ClipboardCopy, ImageIcon, Loader2, Wand2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { GlossaryTip, termById } from '@/components/GlossaryTip'
import type { Catalog } from '@/engine'

type ExportBarProps = {
  catalog: Catalog
  disabled: boolean
  generating: boolean
  error: string | null
  warnings?: string[]
  resultSrc: string | null
  onDirect: () => void
  onPromptbox: () => void
  onGenerate: () => void
}

export function ExportBar({
  catalog,
  disabled,
  generating,
  error,
  warnings,
  resultSrc,
  onDirect,
  onPromptbox,
  onGenerate,
}: ExportBarProps) {
  return (
    <div className="space-y-2">
      {generating ? (
        <p className="flex items-center gap-2 text-[13px] text-teal-100">
          <Loader2 className="size-4 animate-spin" />
          Enviando a Comfy Cloud…
        </p>
      ) : null}
      {error ? (
        <p className="rounded-2xl border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-[13px] leading-snug text-rose-100">
          {error}
        </p>
      ) : null}
      {warnings && warnings.length > 0 ? (
        <ul className="space-y-1 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[13px] leading-snug text-amber-100">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
      {resultSrc ? (
        <figure className="overflow-hidden rounded-2xl border border-teal-400/25 bg-black/30">
          <img src={resultSrc} alt="Imagen generada en Comfy Cloud" className="w-full" />
          <figcaption className="flex items-center gap-1.5 px-3 py-2 text-[11px] text-muted-foreground">
            <ImageIcon className="size-3.5" />
            Resultado Comfy Cloud
          </figcaption>
        </figure>
      ) : null}
      <Button
        size="lg"
        className="w-full bg-rose-400 text-ink hover:bg-rose-300"
        disabled={disabled || generating}
        onClick={onGenerate}
      >
        {generating ? <Loader2 className="animate-spin" /> : <Wand2 />}
        {generating ? 'Generando…' : 'Generar'}
      </Button>
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
      <p className="flex items-start gap-1 pb-1 text-[11px] leading-snug text-muted-foreground">
        <GlossaryTip term={termById(catalog.glossary, 'promptbox')} />
        <span>
          <strong className="text-paper/70">Generar</strong> envía Prompt Final, cerebro, lienzo y
          nombres de LoRA a Comfy Cloud. <strong className="text-paper/70">Deriva</strong> no tira
          la combo: cambia el marco y un detalle raro. Un aviso no es el final. Directo / Promptbox
          solo copian.
        </span>
      </p>
    </div>
  )
}
