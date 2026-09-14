import type { ConceptDef } from '@/engine'
import { cn } from '@/lib/utils'

type CoherentPilotBarProps = {
  enabled: boolean
  concepts: ConceptDef[]
  onToggle: (enabled: boolean) => void
  onSeed: (conceptId: string) => void
}

export function CoherentPilotBar({ enabled, concepts, onToggle, onSeed }: CoherentPilotBarProps) {
  if (concepts.length === 0) return null

  return (
    <section className="rounded-[22px] border border-border bg-black/20 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
            Piloto coherente
          </p>
          <p className="mt-1 text-[12px] leading-snug text-paper/60">
            Conceptos → relaciones → consecuencias → lenguaje. Los bloques anclados no se tocan.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Piloto coherente"
          onClick={() => onToggle(!enabled)}
          className={cn(
            'min-h-10 shrink-0 rounded-2xl border px-3 text-[12px] font-medium',
            enabled
              ? 'border-teal-300/50 bg-teal-300 text-ink'
              : 'border-border bg-input text-paper/70',
          )}
        >
          {enabled ? 'Activado' : 'Apagado'}
        </button>
      </div>
      {enabled ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {concepts.map((concept) => (
            <button
              key={concept.id}
              type="button"
              className="min-h-10 rounded-2xl border border-border bg-input px-3 text-[12px] text-paper/80"
              onClick={() => onSeed(concept.id)}
            >
              {concept.label}
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[12px] text-paper/45">
          Apagado: Experimental usa opciones sueltas como antes.
        </p>
      )}
    </section>
  )
}
