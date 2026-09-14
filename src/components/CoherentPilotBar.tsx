import { GlossaryTip, termById } from '@/components/GlossaryTip'
import { PromptCompare } from '@/components/PromptCompare'
import type { ConceptDef, GlossaryTerm } from '@/engine'
import { cn } from '@/lib/utils'

type CoherentPilotBarProps = {
  enabled: boolean
  concepts: ConceptDef[]
  glossary?: GlossaryTerm[]
  compareOn?: string
  compareOff?: string
  onToggle: (enabled: boolean) => void
  onSeed: (conceptId: string) => void
}

export function CoherentPilotBar({
  enabled,
  concepts,
  glossary,
  compareOn,
  compareOff,
  onToggle,
  onSeed,
}: CoherentPilotBarProps) {
  if (concepts.length === 0) return null

  return (
    <section className="rounded-[22px] border border-border bg-black/20 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1 text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
            Piloto coherente
            <GlossaryTip term={termById(glossary ?? [], 'piloto')} />
          </p>
          <p className="mt-1 text-[12px] leading-snug text-paper/60">
            ON: escena / luz / ropa / cuerpo salen del grafo. OFF: listas sueltas. El prompt
            cambia al tocar el interruptor.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Piloto coherente"
          onClick={() => onToggle(!enabled)}
          className={cn(
            'min-h-11 shrink-0 rounded-2xl border px-3 text-[12px] font-medium',
            enabled
              ? 'border-teal-300/50 bg-teal-300 text-ink'
              : 'border-border bg-input text-paper/70',
          )}
        >
          {enabled ? 'ON · Con piloto' : 'OFF · Sin piloto'}
        </button>
      </div>
      <p
        className={cn(
          'mt-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide uppercase',
          enabled ? 'bg-teal-300/20 text-teal-100' : 'bg-white/8 text-paper/60',
        )}
      >
        {enabled ? 'Prompt activo: Con piloto' : 'Prompt activo: Sin piloto'}
      </p>
      {enabled ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {concepts.map((concept) => (
            <button
              key={concept.id}
              type="button"
              className="min-h-11 rounded-2xl border border-border bg-input px-3 text-[12px] text-paper/80"
              onClick={() => onSeed(concept.id)}
            >
              {concept.label}
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[12px] text-paper/45">
          Apagado: Experimental usa opciones sueltas. Actívalo y toca Piscina o Lluvia para ver
          la diferencia.
        </p>
      )}
      {compareOn !== undefined && compareOff !== undefined ? (
        <div className="mt-3">
          <PromptCompare enabled={enabled} withPilot={compareOn} withoutPilot={compareOff} compact />
        </div>
      ) : null}
    </section>
  )
}
