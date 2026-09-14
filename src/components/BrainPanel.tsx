import { ChevronDown, Upload, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { GlossaryTip, termOrFallback } from '@/components/GlossaryTip'
import { PromptCompare } from '@/components/PromptCompare'
import { Input } from '@/components/ui/input'
import type { GlossaryTerm } from '@/engine'
import {
  defaultMode,
  defaultParamValues,
  findBrain,
  inputsForMode,
  modeLabel,
  negativePlaceholder,
  revokeRefState,
  type BrainParamValues,
  type BrainRefFile,
  type BrainRefState,
  type BrainUiDef,
  type BrainUiPack,
} from '@/engine/brains'
import { cn } from '@/lib/utils'

export type BrainPanelState = {
  brainId: string
  mode: string
  params: BrainParamValues
  negativePrompt: string
  promptFinal: string
  promptDirty: boolean
  refs: BrainRefState
}

type BrainPanelProps = {
  pack: BrainUiPack
  state: BrainPanelState
  assembledPrompt: string
  glossary?: GlossaryTerm[]
  pilotoEnabled?: boolean
  compareOn?: string
  compareOff?: string
  deltaLabel?: string | null
  onChange: (next: BrainPanelState) => void
}

const PARAM_HELP: Record<string, GlossaryTerm> = {
  steps: {
    id: 'steps',
    term: 'Steps',
    text: 'Cuántos pasos da el modelo al pintar. Más pasos = más detalle y más tiempo.',
  },
  guidance: {
    id: 'guidance',
    term: 'Guidance / CFG',
    text: 'Cuánto obedece el texto. Bajo = más libertad. Alto = más literal.',
  },
  shift: {
    id: 'shift',
    term: 'Shift',
    text: 'Desplaza el muestreo (típico en FLUX). Cambia el carácter, no el texto.',
  },
  resolution: {
    id: 'resolution',
    term: 'Resolución',
    text: 'Tamaño de la imagen (ancho × alto). Más grande = más nítido y más lento.',
  },
  seed: {
    id: 'seed',
    term: 'Seed',
    text: 'Número de la suerte. −1 o vacío = una imagen nueva cada vez.',
  },
  scheduler_family: {
    id: 'scheduler',
    term: 'Scheduler',
    text: 'Receta de cómo avanza cada step. Si no sabes, deja el recomendado.',
  },
  negative: {
    id: 'negative',
    term: 'Negative',
    text: 'Lo que no quieres ver. Solo aparece si el cerebro lo soporta.',
  },
  'auto-bloques': {
    id: 'auto-bloques',
    term: 'Auto desde bloques',
    text: 'El Prompt Final se arma solo. Si lo editas a mano, se congela hasta actualizar.',
  },
}

export function createBrainPanelState(pack: BrainUiPack, preferredId?: string): BrainPanelState {
  const brain =
    findBrain(pack, preferredId ?? '') ??
    pack.brains.find((b) => b.brain_id === 'flux') ??
    pack.brains[0]
  if (!brain) {
    return {
      brainId: '',
      mode: 't2i',
      params: {},
      negativePrompt: '',
      promptFinal: '',
      promptDirty: false,
      refs: {},
    }
  }
  return {
    brainId: brain.brain_id,
    mode: defaultMode(brain),
    params: defaultParamValues(brain),
    negativePrompt: '',
    promptFinal: '',
    promptDirty: false,
    refs: {},
  }
}

export function BrainPanel({
  pack,
  state,
  assembledPrompt,
  glossary,
  pilotoEnabled,
  compareOn,
  compareOff,
  deltaLabel,
  onChange,
}: BrainPanelProps) {
  const brain = findBrain(pack, state.brainId) ?? pack.brains[0]
  const displayPrompt = state.promptDirty ? state.promptFinal : assembledPrompt
  const assembledDrifted = state.promptDirty && state.promptFinal.trim() !== assembledPrompt.trim()

  if (!brain) {
    return (
      <section className="rounded-[22px] border border-amber-400/30 bg-amber-400/10 p-3 text-sm">
        No hay cerebros en brains-ui-pack.json
      </section>
    )
  }

  const setBrain = (brainId: string) => {
    const next = findBrain(pack, brainId)
    if (!next) return
    revokeRefState(state.refs)
    onChange({
      brainId,
      mode: defaultMode(next),
      params: defaultParamValues(next),
      negativePrompt: '',
      promptFinal: state.promptDirty ? state.promptFinal : assembledPrompt,
      promptDirty: state.promptDirty,
      refs: {},
    })
  }

  const setMode = (mode: string) => {
    const allowed = new Set(inputsForMode(brain, mode).map((i) => i.id))
    const nextRefs: BrainRefState = {}
    for (const [key, files] of Object.entries(state.refs)) {
      if (allowed.has(key)) nextRefs[key] = files
      else files.forEach((f) => URL.revokeObjectURL(f.objectUrl))
    }
    onChange({ ...state, mode, refs: nextRefs })
  }

  return (
    <section className="space-y-3 rounded-[22px] border border-teal-400/25 bg-card/80 p-3">
      <BrainSelector pack={pack} brain={brain} onChange={setBrain} />
      <ModeSelector brain={brain} mode={state.mode} onChange={setMode} />
      <DynamicParams
        brain={brain}
        values={state.params}
        glossary={glossary}
        onChange={(params) => onChange({ ...state, params })}
      />
      <ConditionalNegative
        brain={brain}
        value={state.negativePrompt}
        glossary={glossary}
        onChange={(negativePrompt) => onChange({ ...state, negativePrompt })}
      />
      <ReferenceUploads
        brain={brain}
        mode={state.mode}
        refs={state.refs}
        onChange={(refs) => onChange({ ...state, refs })}
      />
      <PromptFinalField
        value={displayPrompt}
        dirty={state.promptDirty}
        assembled={assembledPrompt}
        drifted={assembledDrifted}
        glossary={glossary}
        pilotoEnabled={pilotoEnabled}
        compareOn={compareOn}
        compareOff={compareOff}
        deltaLabel={deltaLabel}
        onChange={(promptFinal, promptDirty) => onChange({ ...state, promptFinal, promptDirty })}
      />
      {brain.prompting_style ? (
        <p className="text-[12px] leading-relaxed text-muted-foreground">{brain.prompting_style}</p>
      ) : null}
    </section>
  )
}

function BrainSelector({
  pack,
  brain,
  onChange,
}: {
  pack: BrainUiPack
  brain: BrainUiDef
  onChange: (id: string) => void
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold tracking-[0.16em] text-teal-200/80 uppercase">
        Cerebro / familia (Comfy)
      </span>
      <div className="relative">
        <select
          className="min-h-12 w-full appearance-none rounded-2xl border border-border bg-input px-4 pr-12 text-[15px] outline-none"
          value={brain.brain_id}
          onChange={(e) => onChange(e.target.value)}
        >
          {pack.brains.map((item) => (
            <option key={item.brain_id} value={item.brain_id}>
              {item.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-5 -translate-y-1/2 text-muted-foreground" />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <span className="rounded-full bg-teal-400/12 px-2.5 py-1 text-[11px] text-teal-100">
          {brain.family}
        </span>
        <span className="rounded-full bg-white/6 px-2.5 py-1 text-[11px] text-paper/70">
          {brain.modality}
        </span>
        <span className="rounded-full bg-white/6 px-2.5 py-1 text-[11px] text-paper/70">
          neg {brain.negatives.supported ? 'sí' : 'no'}
        </span>
      </div>
    </label>
  )
}

function ModeSelector({
  brain,
  mode,
  onChange,
}: {
  brain: BrainUiDef
  mode: string
  onChange: (mode: string) => void
}) {
  if (brain.modes.length <= 1) {
    return (
      <p className="text-[12px] text-muted-foreground">
        Modo: <strong className="text-paper/80">{modeLabel(brain.modes[0] ?? mode)}</strong>
      </p>
    )
  }
  return (
    <div className="space-y-1.5">
      <span className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
        Modo
      </span>
      <div className="flex flex-wrap gap-2">
        {brain.modes.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            className={cn(
              'min-h-11 rounded-2xl border px-3 text-[13px] transition',
              m === mode
                ? 'border-teal-300/50 bg-teal-300/15 text-teal-50'
                : 'border-border bg-black/20 text-paper/70',
            )}
          >
            {modeLabel(m)}
          </button>
        ))}
      </div>
    </div>
  )
}

function paramTerm(glossary: GlossaryTerm[] | undefined, paramId: string): GlossaryTerm | undefined {
  const fallback = PARAM_HELP[paramId] ?? (paramId === 'cfg' ? PARAM_HELP.guidance : undefined)
  if (!fallback && !glossary?.length) return undefined
  return termOrFallback(
    glossary,
    paramId === 'cfg' ? 'guidance' : paramId === 'scheduler_family' ? 'scheduler' : paramId,
    fallback ?? { id: paramId, term: paramId, text: 'Parámetro del cerebro seleccionado.' },
  )
}

function DynamicParams({
  brain,
  values,
  glossary,
  onChange,
}: {
  brain: BrainUiDef
  values: BrainParamValues
  glossary?: GlossaryTerm[]
  onChange: (v: BrainParamValues) => void
}) {
  if (!brain.params.length) return null
  return (
    <div className="space-y-2">
      <span className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
        Parámetros del cerebro
      </span>
      <div className="grid gap-2 sm:grid-cols-2">
        {brain.params.map((param) => {
          const raw = values[param.id]
          const isNum = param.kind === 'number'
          const num = typeof raw === 'number' ? raw : Number(raw)
          const min = param.min ?? undefined
          const max = param.max ?? undefined
          const step = param.step ?? 1
          const recommended =
            param.recommended !== null && param.recommended !== undefined
              ? String(param.recommended)
              : null
          const tip = paramTerm(glossary, param.id)

          if (isNum) {
            return (
              <label key={param.id} className="flex flex-col gap-1 rounded-2xl bg-black/20 px-3 py-2">
                <span className="flex items-center justify-between gap-2 text-[12px] text-paper/80">
                  <span className="flex items-center gap-0.5">
                    {param.label}
                    <GlossaryTip term={tip} />
                  </span>
                  <span className="tabular-nums text-teal-100">{Number.isFinite(num) ? num : '—'}</span>
                </span>
                <input
                  type="range"
                  className="w-full accent-teal-300"
                  min={min ?? 0}
                  max={max ?? 100}
                  step={step}
                  value={Number.isFinite(num) ? num : Number(param.default) || 0}
                  onChange={(e) =>
                    onChange({ ...values, [param.id]: Number(e.target.value) })
                  }
                />
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    className="min-h-10 text-sm"
                    min={min}
                    max={max}
                    step={step}
                    value={Number.isFinite(num) ? num : ''}
                    onChange={(e) => {
                      const v = e.target.value === '' ? '' : Number(e.target.value)
                      onChange({ ...values, [param.id]: v === '' ? '' : v })
                    }}
                  />
                  {recommended ? (
                    <button
                      type="button"
                      className="shrink-0 rounded-xl border border-border px-2 py-1 text-[11px] text-muted-foreground"
                      onClick={() =>
                        onChange({
                          ...values,
                          [param.id]:
                            typeof param.recommended === 'number'
                              ? param.recommended
                              : Number(param.recommended),
                        })
                      }
                    >
                      rec. {recommended}
                    </button>
                  ) : null}
                </div>
              </label>
            )
          }

          return (
            <label key={param.id} className="flex flex-col gap-1 rounded-2xl bg-black/20 px-3 py-2 sm:col-span-2">
              <span className="flex items-center gap-0.5 text-[12px] text-paper/80">
                {param.label}
                <GlossaryTip term={tip} />
                {recommended ? (
                  <span className="ml-2 text-[11px] text-muted-foreground">rec. {recommended}</span>
                ) : null}
              </span>
              <Input
                value={raw === undefined || raw === null ? '' : String(raw)}
                placeholder={recommended ?? param.label}
                onChange={(e) => onChange({ ...values, [param.id]: e.target.value })}
              />
            </label>
          )
        })}
      </div>
    </div>
  )
}

function ConditionalNegative({
  brain,
  value,
  glossary,
  onChange,
}: {
  brain: BrainUiDef
  value: string
  glossary?: GlossaryTerm[]
  onChange: (v: string) => void
}) {
  if (!brain.negatives.supported) {
    return (
      <p className="rounded-2xl bg-black/25 px-3 py-2 text-[12px] text-muted-foreground">
        Este cerebro (<strong className="text-paper/70">{brain.family}</strong>) no usa negative
        prompt nativo — el campo queda oculto.
      </p>
    )
  }
  const ph = negativePlaceholder(brain)
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-center gap-0.5 text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
        Negative prompt
        <GlossaryTip term={termOrFallback(glossary, 'negative', PARAM_HELP.negative)} />
      </span>
      <textarea
        className="min-h-24 w-full rounded-2xl border border-border bg-input px-3 py-2 text-[14px] outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        value={value}
        placeholder={ph}
        onChange={(e) => onChange(e.target.value)}
      />
      {brain.negatives.note ? (
        <span className="text-[11px] text-muted-foreground">{brain.negatives.note}</span>
      ) : null}
    </label>
  )
}

function ReferenceUploads({
  brain,
  mode,
  refs,
  onChange,
}: {
  brain: BrainUiDef
  mode: string
  refs: BrainRefState
  onChange: (refs: BrainRefState) => void
}) {
  const inputs = useMemo(() => inputsForMode(brain, mode), [brain, mode])
  if (!inputs.length) return null

  const addFiles = (inputId: string, kind: string, max: number | undefined, list: FileList | null) => {
    if (!list?.length) return
    const acceptVideo = kind === 'video'
    const picked = Array.from(list).filter((f) =>
      acceptVideo ? f.type.startsWith('video/') : f.type.startsWith('image/'),
    )
    const existing = refs[inputId] ?? []
    const room = max && max > 0 ? Math.max(0, max - existing.length) : picked.length
    const slice = max === 1 ? picked.slice(0, 1) : picked.slice(0, room || picked.length)
    if (max === 1) {
      existing.forEach((f) => URL.revokeObjectURL(f.objectUrl))
    }
    const added: BrainRefFile[] = slice.map((file) => ({
      id: `${inputId}-${file.name}-${file.size}-${file.lastModified}`,
      file,
      objectUrl: URL.createObjectURL(file),
      name: file.name,
    }))
    const nextList = max === 1 ? added : [...existing, ...added].slice(0, max ?? undefined)
    onChange({ ...refs, [inputId]: nextList })
  }

  const remove = (inputId: string, fileId: string) => {
    const list = refs[inputId] ?? []
    const target = list.find((f) => f.id === fileId)
    if (target) URL.revokeObjectURL(target.objectUrl)
    onChange({ ...refs, [inputId]: list.filter((f) => f.id !== fileId) })
  }

  return (
    <div className="space-y-2">
      <span className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
        Referencias ({modeLabel(mode)})
      </span>
      {inputs.map((input) => {
        const files = refs[input.id] ?? []
        const multi = input.kind === 'image_multi' || (input.max ?? 0) > 1
        const accept = input.kind === 'video' ? 'video/*' : 'image/*'
        return (
          <div key={input.id} className="rounded-2xl border border-border bg-black/20 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] text-paper/85">
                {input.label}
                {input.required ? <span className="text-rose-300"> *</span> : null}
                {input.max ? (
                  <span className="text-muted-foreground"> · máx {input.max}</span>
                ) : null}
              </p>
              <label className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-border bg-input px-3 text-[12px]">
                <Upload className="size-3.5" />
                Subir
                <input
                  type="file"
                  className="hidden"
                  accept={accept}
                  multiple={multi}
                  onChange={(e) => {
                    addFiles(input.id, input.kind, input.max ?? (multi ? 8 : 1), e.target.files)
                    e.target.value = ''
                  }}
                />
              </label>
            </div>
            {files.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-2">
                {files.map((f) => (
                  <li
                    key={f.id}
                    className="relative overflow-hidden rounded-xl border border-border bg-ink/60"
                  >
                    {input.kind === 'video' ? (
                      <video src={f.objectUrl} className="h-20 w-28 object-cover" muted />
                    ) : (
                      <img src={f.objectUrl} alt={f.name} className="h-20 w-20 object-cover" />
                    )}
                    <button
                      type="button"
                      aria-label={`Quitar ${f.name}`}
                      className="absolute top-1 right-1 rounded-full bg-ink/80 p-1"
                      onClick={() => remove(input.id, f.id)}
                    >
                      <X className="size-3.5" />
                    </button>
                    <p className="max-w-28 truncate px-1.5 py-0.5 text-[10px] text-paper/60">
                      {f.name}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-[11px] text-muted-foreground">
                UI lista — el adaptador Comfy de refs se cableará en el siguiente lote.
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}

function PromptFinalField({
  value,
  dirty,
  assembled,
  drifted,
  glossary,
  pilotoEnabled,
  compareOn,
  compareOff,
  deltaLabel,
  onChange,
}: {
  value: string
  dirty: boolean
  assembled: string
  drifted: boolean
  glossary?: GlossaryTerm[]
  pilotoEnabled?: boolean
  compareOn?: string
  compareOff?: string
  deltaLabel?: string | null
  onChange: (value: string, dirty: boolean) => void
}) {
  const [flash, setFlash] = useState(false)
  const prevAssembled = useRef(assembled)

  useEffect(() => {
    if (prevAssembled.current === assembled) return
    prevAssembled.current = assembled
    setFlash(true)
    const handle = window.setTimeout(() => setFlash(false), 700)
    return () => window.clearTimeout(handle)
  }, [assembled])

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {pilotoEnabled === undefined ? null : (
          <span
            className={
              pilotoEnabled
                ? 'rounded-full bg-teal-300/20 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-teal-100 uppercase'
                : 'rounded-full bg-white/8 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-paper/60 uppercase'
            }
          >
            {pilotoEnabled ? 'Con piloto' : 'Sin piloto'}
          </span>
        )}
        {deltaLabel ? (
          <span className="rounded-full bg-amber-300/20 px-2.5 py-1 text-[11px] text-amber-100">
            {deltaLabel}
          </span>
        ) : null}
      </div>

      <div
        className={`rounded-2xl border border-teal-400/20 bg-black/25 px-3 py-2 ${flash ? 'prompt-flash' : ''}`}
      >
        <p className="flex items-center justify-between gap-2 text-[10px] font-semibold tracking-[0.16em] text-teal-200/80 uppercase">
          <span>Ensamblado (siempre al día)</span>
          <span className="normal-case tracking-normal text-paper/40">sigue bloques</span>
        </p>
        <p className="mt-1 text-[13px] leading-snug text-paper/85">
          {assembled.trim() || 'Vacío. Experimenta o incluye un LoRA.'}
        </p>
      </div>

      {compareOn !== undefined && compareOff !== undefined && pilotoEnabled !== undefined ? (
        <PromptCompare enabled={pilotoEnabled} withPilot={compareOn} withoutPilot={compareOff} />
      ) : null}

      <label className="flex flex-col gap-1.5">
        <span className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
          <span className="flex items-center gap-0.5">
            Prompt Final
            <GlossaryTip term={termOrFallback(glossary, 'auto-bloques', PARAM_HELP['auto-bloques'])} />
          </span>
          {dirty ? (
            <button
              type="button"
              className="min-h-11 rounded-xl bg-teal-300 px-3 text-[12px] font-medium tracking-normal text-ink normal-case"
              onClick={() => onChange(assembled, false)}
            >
              Actualizar desde bloques
            </button>
          ) : (
            <span className="normal-case tracking-normal text-paper/40">auto desde bloques</span>
          )}
        </span>
        {drifted ? (
          <p className="rounded-xl bg-amber-400/15 px-3 py-2 text-[12px] text-amber-100">
            Editaste el Final a mano. Los bloques / LoRAs siguen cambiando el ensamblado de
            arriba. Pulsa <strong>Actualizar desde bloques</strong> para copiarlo aquí.
          </p>
        ) : null}
        <textarea
          className="min-h-28 w-full rounded-2xl border border-border bg-input px-3 py-2 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={value}
          onChange={(e) => onChange(e.target.value, true)}
          placeholder="El prompt ensamblado aparece aquí; puedes editarlo a mano."
        />
      </label>
    </div>
  )
}
