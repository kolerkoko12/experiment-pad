import { Copy, ExternalLink, Layers, Plus, Sparkles, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'

import { GlossaryTip, termById } from '@/components/GlossaryTip'
import { Button } from '@/components/ui/button'
import type { Catalog, LoraDef, MageModel, PromptState } from '@/engine'
import {
  effectiveLoraLimit,
  isAtLoraLimit,
  isOverLoraLimit,
  loraFitsModel,
  loraIsOnComfy,
  loraKeywordText,
  loraTriggerText,
  lorasByCategory,
  resolveLoraComfyName,
  selectedLoras,
} from '@/engine'
import { cn } from '@/lib/utils'

type LoraPanelProps = {
  catalog: Catalog
  state: PromptState
  model: MageModel | undefined
  brainId?: string
  recommendedIds: string[]
  open: boolean
  onClose: () => void
  onInclude: (id: string) => 'ok' | 'blocked'
  onRemove: (id: string) => void
  onClear: () => void
  onSuggest: () => void
  onCopyKeywords: (lora: LoraDef) => void
}

export function LoraPanel(props: LoraPanelProps) {
  return (
    <>
      <aside className="lora-dock hidden min-h-0 lg:flex" aria-label="Panel de LoRAs">
        <LoraPanelBody {...props} showClose={false} />
      </aside>
      {props.open ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/65 backdrop-blur-sm lg:hidden">
          <button type="button" className="min-w-8 flex-1" aria-label="Cerrar LoRAs" onClick={props.onClose} />
          <aside className="flex h-full w-[min(100%,420px)] flex-col border-l border-border bg-popover pb-[env(safe-area-inset-bottom)]">
            <LoraPanelBody {...props} showClose />
          </aside>
        </div>
      ) : null}
    </>
  )
}

function LoraPanelBody({
  catalog,
  state,
  model,
  brainId,
  recommendedIds,
  showClose,
  onClose,
  onInclude,
  onRemove,
  onClear,
  onSuggest,
  onCopyKeywords,
}: LoraPanelProps & { showClose: boolean }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const selected = selectedLoras(state, catalog)
  const max = effectiveLoraLimit(catalog, model, state.selectedPlanId)
  const over = isOverLoraLimit(state.selectedLoraIds.length, max)
  const at = isAtLoraLimit(state.selectedLoraIds.length, max)
  const recommended = new Set(recommendedIds)
  const groups = useMemo(() => lorasByCategory(catalog.loras), [catalog.loras])
  const includedGreen = selected.length > 0 && !over

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-border px-4 pt-3 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.16em] text-violet-200/80 uppercase">
              Biblioteca
            </p>
            <h2 className="flex items-center font-display text-2xl tracking-tight">
              LoRAs
              <GlossaryTip term={termById(catalog.glossary, 'lora')} />
            </h2>
          </div>
          {showClose ? (
            <Button type="button" variant="ghost" size="icon" aria-label="Cerrar LoRAs" onClick={onClose}>
              <X />
            </Button>
          ) : null}
        </div>
        <p
          className={cn(
            'mt-2 rounded-2xl px-3 py-2 text-[13px] font-medium',
            over
              ? 'bg-rose-500/25 text-rose-100'
              : includedGreen
                ? 'bg-emerald-500/20 text-emerald-100'
                : 'bg-black/25 text-paper/60',
          )}
        >
          {selected.length} incluidas
          {max > 0 ? ` / ${max} slots` : ' · este motor no lista archivos LoRA'}
          {over ? ' · LÍMITE: sube de plan o quita una.' : includedGreen ? ' · ok' : ''}
        </p>
        <p className="mt-2 text-[12px] leading-snug text-paper/50">
          Generar carga los pesos en Comfy Cloud (LoraLoader). El iPad solo manda el nombre del
          archivo, nunca el .safetensors.
        </p>
        {model?.loraNote ? (
          <p className="mt-1 text-[12px] text-muted-foreground">{model.loraNote}</p>
        ) : null}
        {at || over ? (
          <p className="mt-2 text-[12px] leading-snug text-rose-100">
            Tope de slots: quita una LoRA o abre «motor legado / techo LoRAs» para subir el plan.
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={onSuggest}>
            <Sparkles />
            Sugerir por escena
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={selected.length === 0} onClick={onClear}>
            <Trash2 />
            Quitar todas
          </Button>
        </div>
        <div className="mt-3">
          <p className="text-[11px] tracking-wide text-paper/45 uppercase">
            Seleccionadas · {selected.length}/{max || '—'}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {selected.length === 0 ? (
              <span className="text-[12px] text-paper/40">Ninguna. Toca incluir abajo.</span>
            ) : (
              selected.map((lora) => (
                <button
                  key={lora.id}
                  type="button"
                  onClick={() => setExpandedId((id) => (id === lora.id ? null : lora.id))}
                  className="min-h-10 rounded-2xl px-3 text-[12px] text-ink"
                  style={{ background: lora.categoryColor }}
                >
                  {lora.name}
                  {loraIsOnComfy(lora, brainId) ? '' : ' · texto'}
                </button>
              ))
            )}
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3">
        {groups.map((group) => (
          <section key={group.category}>
            <h3 className="mb-2 flex items-center gap-2 text-[12px] font-semibold tracking-wide uppercase">
              <span className="size-2.5 rounded-full" style={{ background: group.color }} />
              <span style={{ color: group.color }}>{group.category}</span>
            </h3>
            <div className="space-y-3">
              {group.items.map((lora) => (
                <LoraCard
                  key={lora.id}
                  lora={lora}
                  included={state.selectedLoraIds.includes(lora.id)}
                  expanded={expandedId === lora.id || state.selectedLoraIds.includes(lora.id) && expandedId === lora.id}
                  recommended={recommended.has(lora.id)}
                  fits={loraFitsModel(lora, state.selectedModelId)}
                  onComfy={loraIsOnComfy(lora, brainId)}
                  comfyFile={resolveLoraComfyName(lora, brainId)}
                  glossary={catalog.glossary}
                  onToggleExpand={() => setExpandedId((id) => (id === lora.id ? null : lora.id))}
                  onCopy={() => onCopyKeywords(lora)}
                  onInclude={() => onInclude(lora.id)}
                  onRemove={() => onRemove(lora.id)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

function LoraCard({
  lora,
  included,
  expanded,
  recommended,
  fits,
  onComfy,
  comfyFile,
  glossary,
  onToggleExpand,
  onCopy,
  onInclude,
  onRemove,
}: {
  lora: LoraDef
  included: boolean
  expanded: boolean
  recommended: boolean
  fits: boolean
  onComfy: boolean
  comfyFile: string | null
  glossary: Catalog['glossary']
  onToggleExpand: () => void
  onCopy: () => void
  onInclude: () => 'ok' | 'blocked'
  onRemove: () => void
}) {
  const rich = expanded || (!included && recommended)
  return (
    <article
      className={cn(
        'rounded-[22px] border px-3 py-3',
        lora.source === 'imported' ? 'border-rose-300/40 bg-rose-400/10' : 'border-border bg-black/20',
        included && 'ring-1 ring-emerald-300/50',
      )}
    >
      <button type="button" onClick={onToggleExpand} className="w-full text-left">
        <div className="flex items-center gap-2">
          {lora.source === 'imported' ? (
            <span className="rounded-full bg-rose-400 px-2 py-0.5 text-[10px] font-semibold text-ink">
              Importada
            </span>
          ) : (
            <span className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] text-paper/55">
              Catálogo
            </span>
          )}
          <span className="rounded-full px-2 py-0.5 text-[10px] text-ink" style={{ background: lora.categoryColor }}>
            {lora.category}
          </span>
        </div>
        <h3 className="mt-1 text-[16px] text-paper">{lora.name}</h3>
        <p className="mt-1 line-clamp-2 text-[13px] text-paper/70">{lora.description}</p>
        <p className="mt-1.5 text-[11px] leading-snug">
          {onComfy ? (
            <span className="text-emerald-200/90">Comfy Cloud · pesos en el servidor</span>
          ) : (
            <span className="text-amber-200/90">solo texto / falta en Comfy</span>
          )}
        </p>
      </button>
      {rich ? (
        <>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {onComfy ? (
              <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] text-emerald-100">
                Comfy Cloud
              </span>
            ) : (
              <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] text-amber-200">
                solo texto / falta en Comfy
              </span>
            )}
            {lora.placeholder && !onComfy ? (
              <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] text-amber-200">
                Placeholder
              </span>
            ) : null}
            {recommended ? (
              <span className="rounded-full bg-teal-400/15 px-2 py-0.5 text-[10px] text-teal-100">
                Encaja con la escena
              </span>
            ) : null}
            {!fits ? (
              <span className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] text-paper/55">
                Otro motor — solo texto
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-[12px] text-paper/55">
            Keywords <GlossaryTip term={termById(glossary, 'keyword')} /> · {loraKeywordText(lora) || '—'}
          </p>
          <p className="mt-1 text-[12px] text-paper/55">
            Triggers <GlossaryTip term={termById(glossary, 'trigger')} /> · {loraTriggerText(lora) || '—'}
          </p>
          <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
            <WeightChip tone="low" label="Bajo" value={lora.weight.low} note={lora.weight.notes.low} />
            <WeightChip tone="mid" label="Medio" value={lora.weight.mid} note={lora.weight.notes.mid} />
            <WeightChip tone="high" label="Alto" value={lora.weight.high} note={lora.weight.notes.high} />
          </div>
          {onComfy && comfyFile ? (
            <p className="mt-2 text-[11px] break-all text-emerald-100/80">
              Generar carga <span className="font-medium">{comfyFile}</span> en el servidor. No se
              descarga al iPad.
            </p>
          ) : (
            <p className="mt-2 text-[11px] text-amber-200/90">
              No hay archivo en Comfy Cloud para este cerebro. Incluir solo pega el trigger al
              prompt.
            </p>
          )}
          <p className="mt-2 text-[12px] text-muted-foreground">{lora.tip}</p>
          {lora.examplesUrl ? (
            <a
              href={lora.examplesUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-[13px] text-violet-200"
            >
              <ExternalLink className="size-4" />
              Ver ejemplos
            </a>
          ) : (
            <p className="mt-2 text-[11px] text-paper/35">Sin URL exacta de este LoRA.</p>
          )}
        </>
      ) : null}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onCopy}>
          <Copy />
          Copiar keywords
        </Button>
        {included ? (
          <Button type="button" size="sm" variant="secondary" onClick={onRemove}>
            <Trash2 />
            Quitar
          </Button>
        ) : (
          <Button type="button" size="sm" onClick={onInclude}>
            <Plus />
            Incluir en el prompt
          </Button>
        )}
      </div>
    </article>
  )
}

function WeightChip({
  tone,
  label,
  value,
  note,
}: {
  tone: 'low' | 'mid' | 'high'
  label: string
  value: number
  note: string
}) {
  const bg = tone === 'low' ? 'bg-teal-400/15 text-teal-100' : tone === 'mid' ? 'bg-amber-400/15 text-amber-100' : 'bg-rose-400/20 text-rose-100'
  return (
    <div className={cn('rounded-2xl px-1.5 py-2', bg)}>
      <p className="text-[10px] tracking-wide uppercase">{label}</p>
      <p className="font-display text-lg leading-none">{value}</p>
      <p className="mt-1 text-[10px] leading-snug opacity-80">{note}</p>
    </div>
  )
}

export function LoraOpenButton({
  count,
  onClick,
}: {
  count: number
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      className={count > 0 ? 'border-emerald-400/50 text-emerald-100' : undefined}
      aria-label="Abrir LoRAs"
    >
      <Layers />
      LoRAs{count > 0 ? ` · ${count}` : ''}
    </Button>
  )
}
