import { cn } from '@/lib/utils'

type PromptCompareProps = {
  enabled: boolean
  withPilot: string
  withoutPilot: string
  compact?: boolean
}

function clip(text: string, max = 220): string {
  const trimmed = text.trim()
  if (!trimmed) return 'Vacío'
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max).trim()}…`
}

export function PromptCompare({ enabled, withPilot, withoutPilot, compact }: PromptCompareProps) {
  const same = withPilot.trim() === withoutPilot.trim()
  return (
    <div className={cn('grid gap-2', compact ? '' : 'sm:grid-cols-2')}>
      <CompareCard
        label="Con piloto"
        active={enabled}
        text={clip(withPilot)}
        tone="on"
      />
      <CompareCard
        label="Sin piloto"
        active={!enabled}
        text={clip(withoutPilot)}
        tone="off"
      />
      {same ? (
        <p className="text-[11px] text-amber-200/80 sm:col-span-2">
          Aún se ven iguales. Pulsa Experimentar o un chip (Piscina / Lluvia) con el piloto
          activado.
        </p>
      ) : null}
    </div>
  )
}

function CompareCard({
  label,
  active,
  text,
  tone,
}: {
  label: string
  active: boolean
  text: string
  tone: 'on' | 'off'
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border px-3 py-2',
        active
          ? tone === 'on'
            ? 'border-teal-300/50 bg-teal-300/12'
            : 'border-paper/25 bg-white/8'
          : 'border-border bg-black/20 opacity-70',
      )}
    >
      <p className="flex items-center justify-between gap-2 text-[10px] font-semibold tracking-[0.14em] uppercase">
        <span className={active ? (tone === 'on' ? 'text-teal-100' : 'text-paper/80') : 'text-paper/45'}>
          {label}
        </span>
        {active ? (
          <span className="rounded-full bg-paper px-2 py-0.5 text-[9px] tracking-wide text-ink">
            Activo
          </span>
        ) : (
          <span className="text-paper/35">referencia</span>
        )}
      </p>
      <p className="mt-1 text-[12px] leading-snug text-paper/80">{text}</p>
    </div>
  )
}
