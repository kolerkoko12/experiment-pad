import { GlossaryTip, termById } from '@/components/GlossaryTip'
import type { Catalog, ExaggerationState, Intensity } from '@/engine'
import { intensityTint } from '@/engine'
import { cn } from '@/lib/utils'

type SpicyBarProps = {
  catalog: Catalog
  spicyLevel: Intensity
  exaggeration: ExaggerationState
  onSpicy: (level: Intensity) => void
  onBody: (level: Intensity) => void
  onScene: (level: Intensity) => void
  onExtra: (key: 'futanari' | 'fluids', value: boolean) => void
}

export function SpicyBar({
  catalog,
  spicyLevel,
  exaggeration,
  onSpicy,
  onBody,
  onScene,
  onExtra,
}: SpicyBarProps) {
  return (
    <section className="rounded-[22px] border border-rose-400/25 bg-rose-400/8 p-3">
      <div className="flex items-center gap-1">
        <p className="text-[11px] font-semibold tracking-[0.16em] text-rose-200 uppercase">
          Picante y exageración
        </p>
        <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] text-amber-100">
          beta
        </span>
        <GlossaryTip term={termById(catalog.glossary, 'spicy')} />
        <GlossaryTip term={termById(catalog.glossary, 'exaggeration')} />
      </div>
      <p className="mt-1 text-[12px] text-paper/55">
        Picante = sexualidad de la situación. Exageración = toca los tramos grises del prompt
        (cuerpo / escena).
      </p>
      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {catalog.spicy.levels.map((level) => (
          <button
            key={level.id}
            type="button"
            onClick={() => onSpicy(level.id)}
            className={cn(
              'min-h-11 rounded-2xl text-[12px] font-medium',
              spicyLevel === level.id ? 'bg-rose-400 text-ink' : 'bg-black/30 text-paper/70',
            )}
          >
            {level.id === 0 ? '0' : level.label.replace('Picante ', 'P')}
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <IntensityRow label="Cuerpo" value={exaggeration.body} onChange={onBody} />
        <IntensityRow label="Escena" value={exaggeration.scene} onChange={onScene} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <label className="flex min-h-11 items-center gap-2 rounded-2xl bg-black/25 px-3 text-[13px]">
          <input
            type="checkbox"
            checked={exaggeration.extras.futanari}
            onChange={(event) => onExtra('futanari', event.target.checked)}
          />
          {catalog.spicy.extras.futanari.label}
        </label>
        <label className="flex min-h-11 items-center gap-2 rounded-2xl bg-black/25 px-3 text-[13px]">
          <input
            type="checkbox"
            checked={exaggeration.extras.fluids}
            onChange={(event) => onExtra('fluids', event.target.checked)}
          />
          {catalog.spicy.extras.fluids.label}
        </label>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Futanari / fluidos son ganchos de estructura: el prompt extra está vacío hasta que lo
        rellenes en data/spicy.json.
      </p>
    </section>
  )
}

function IntensityRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: Intensity
  onChange: (level: Intensity) => void
}) {
  return (
    <div>
      <p className="mb-1 text-[11px] text-paper/50">{label}</p>
      <div className="grid grid-cols-4 gap-1">
        {([0, 1, 2, 3] as Intensity[]).map((level) => (
          <button
            key={level}
            type="button"
            onClick={() => onChange(level)}
            className="min-h-10 rounded-xl text-[12px]"
            style={{
              background: value === level ? intensityTint(level) : 'rgba(0,0,0,0.28)',
              outline: value === level ? '1px solid rgba(255,255,255,0.25)' : undefined,
            }}
          >
            {level}
          </button>
        ))}
      </div>
    </div>
  )
}
