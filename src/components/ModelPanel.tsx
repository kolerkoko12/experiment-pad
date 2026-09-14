import { ChevronDown } from 'lucide-react'

import type { Catalog, MageModel } from '@/engine'
import { effectiveLoraLimit, findPlan, isOverLoraLimit } from '@/engine'

type ModelPanelProps = {
  catalog: Catalog
  models: MageModel[]
  selectedId: string
  planId: string
  selectedLoraCount: number
  onChange: (id: string) => void
  onPlan: (id: string) => void
  onPasteAnalysis: () => void
  /** Soft-deprioritize: collapse by default when brains UI is active */
  collapsedDefault?: boolean
}

export function ModelPanel({
  catalog,
  models,
  selectedId,
  planId,
  selectedLoraCount,
  onChange,
  onPlan,
  onPasteAnalysis,
  collapsedDefault = true,
}: ModelPanelProps) {
  const model = models.find((item) => item.id === selectedId) ?? models[0]
  const plan = findPlan(catalog, planId)
  if (!model || !plan) return null
  const max = effectiveLoraLimit(catalog, model, planId)
  const over = isOverLoraLimit(selectedLoraCount, max)

  return (
    <details
      className="rounded-[22px] border border-border bg-card/50 p-3"
      open={!collapsedDefault ? true : undefined}
    >
      <summary className="cursor-pointer list-none text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
        Motor legado / cuotas (opcional) · {model.name}
      </summary>

      <div className="mt-3 space-y-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
            Familia / checkpoint (legado)
          </span>
          <div className="relative">
            <select
              className="min-h-12 w-full appearance-none rounded-2xl border border-border bg-input px-4 pr-12 text-[15px] outline-none"
              value={model.id}
              onChange={(event) => onChange(event.target.value)}
            >
              {models.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.placeholder ? `${item.name} · placeholder` : item.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-5 -translate-y-1/2 text-muted-foreground" />
          </div>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
            Plan / techo LoRAs (legado)
          </span>
          <div className="relative">
            <select
              className="min-h-12 w-full appearance-none rounded-2xl border border-border bg-input px-4 pr-12 text-[15px] outline-none"
              value={plan.id}
              onChange={(event) => onPlan(event.target.value)}
            >
              {catalog.mage.plans.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.maxLoras} LoRAs
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-5 -translate-y-1/2 text-muted-foreground" />
          </div>
        </label>

        <div className="rounded-2xl bg-black/25 px-3 py-2 text-[13px] text-paper/80">
          Techo de este motor + plan: <strong>{max}</strong> LoRAs. Motor {model.maxLoras} · plan{' '}
          {plan.maxLoras}.
          <p className="mt-1 text-[12px] text-muted-foreground">{plan.note}</p>
        </div>

        {over ? (
          <div className="mt-2 rounded-2xl bg-rose-500/20 px-3 py-2 text-[13px] text-rose-50">
            Pasaste el techo ({selectedLoraCount}/{max || 0}). Quita LoRAs o sube el plan.{' '}
            <a className="underline" href={catalog.mage.helpUrl} target="_blank" rel="noreferrer">
              Ayuda cuotas
            </a>
          </div>
        ) : null}

        <div className="space-y-2">
          <p className="text-[14px] leading-relaxed text-paper/90">{model.tip}</p>
          <div className="flex flex-wrap gap-1.5">
            <span className="rounded-full bg-white/6 px-2.5 py-1 text-[11px] text-paper/70">
              {model.family}
            </span>
            {model.placeholder ? (
              <span className="rounded-full bg-amber-400/15 px-2.5 py-1 text-[11px] text-amber-200">
                Placeholder
              </span>
            ) : null}
            {model.strengths.map((item) => (
              <span
                key={item}
                className="rounded-full bg-teal-400/12 px-2.5 py-1 text-[11px] text-teal-100"
              >
                {item}
              </span>
            ))}
          </div>
          {model.notes ? (
            <p className="text-[12px] leading-relaxed text-muted-foreground">{model.notes}</p>
          ) : null}
          <button
            type="button"
            onClick={onPasteAnalysis}
            className="block min-h-11 text-left text-[13px] text-paper/70 underline"
          >
            Pegar análisis → bloques
          </button>
        </div>
      </div>
    </details>
  )
}
