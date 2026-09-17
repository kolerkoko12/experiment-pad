/** Brain UI pack loader — drives dynamic params/modes/refs without a full semantic graph. */

export type BrainNegatives = {
  supported: boolean
  examples_v0_1?: string
  examples_api?: string
  examples_v2_0_short?: string
  note?: string
  via?: string
  policy?: string
  open_weights_diffusers?: string
  api?: string
  diffusers_examples?: string
  force_zeros_for_empty_prompt_default?: boolean
  optimal_magnitudes_by_domain?: string
  effective_when_cfg_gt_1?: boolean
}

export type BrainParamDef = {
  id: string
  label: string
  default?: number | string | null
  recommended?: number | string | null
  min?: number | null
  max?: number | null
  step?: number | null
  notes?: string | null
  kind?: 'number' | 'text' | 'select'
  options?: string[]
}

export type BrainModeInput = {
  id: string
  kind: 'image' | 'video' | 'image_multi' | string
  label: string
  required?: boolean
  max?: number
}

export type BrainUiDef = {
  brain_id: string
  family: string
  modality: 'image' | 'video' | string
  label: string
  negatives: BrainNegatives
  prompting_style?: string
  priority_order?: string[]
  params: BrainParamDef[]
  modes: string[]
  inputs_by_mode: Record<string, BrainModeInput[]>
  dynamic_blocks?: string[]
  capabilities?: string[]
}

export type BrainUiPack = {
  version: number
  brains: BrainUiDef[]
}

export type BrainParamValues = Record<string, number | string>

export type BrainRefFile = {
  id: string
  file: File
  objectUrl: string
  name: string
}

export type BrainRefState = Record<string, BrainRefFile[]>

/** Soft UI fallbacks when pack leaves default/min/max null (evidence often multi-valued). */
const PARAM_UI_HINTS: Record<
  string,
  Partial<Pick<BrainParamDef, 'kind' | 'default' | 'recommended' | 'min' | 'max' | 'step'>>
> = {
  guidance: { kind: 'number', default: 5, recommended: 5, min: 0, max: 20, step: 0.5 },
  steps: { kind: 'number', default: 28, recommended: 28, min: 1, max: 100, step: 1 },
  shift: { kind: 'number', default: 3, recommended: 3, min: 0, max: 12, step: 0.1 },
  seed: { kind: 'number', default: -1, recommended: -1, min: -1, max: 2147483647, step: 1 },
  resolution: { kind: 'text', default: '1024x1024', recommended: '1024x1024' },
  scheduler_family: { kind: 'text', default: '', recommended: '' },
  duration_fps: { kind: 'text', default: '5s @ 24fps', recommended: '5s @ 24fps' },
}

const MODE_LABELS: Record<string, string> = {
  t2i: 'Texto → imagen',
  i2i: 'Imagen → imagen',
  t2v: 'Texto → vídeo',
  i2v: 'Imagen → vídeo',
  r2v: 'Referencias → vídeo',
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`No se pudo cargar ${url} (${res.status})`)
  return (await res.json()) as T
}

function enrichParam(raw: BrainParamDef): BrainParamDef {
  const hint = PARAM_UI_HINTS[raw.id] ?? {}
  const kind =
    raw.kind ??
    hint.kind ??
    (typeof (raw.default ?? hint.default) === 'number' || raw.min != null || raw.max != null
      ? 'number'
      : 'text')
  return {
    ...raw,
    kind,
    default: raw.default ?? hint.default ?? (kind === 'number' ? 0 : ''),
    recommended: raw.recommended ?? hint.recommended ?? raw.default ?? hint.default ?? null,
    min: raw.min ?? hint.min ?? null,
    max: raw.max ?? hint.max ?? null,
    step: raw.step ?? hint.step ?? (kind === 'number' ? 1 : null),
  }
}

function normalizeBrain(raw: BrainUiDef): BrainUiDef {
  return {
    ...raw,
    negatives: raw.negatives ?? { supported: false },
    params: (raw.params ?? []).map(enrichParam),
    modes: raw.modes?.length ? raw.modes : ['t2i'],
    inputs_by_mode: raw.inputs_by_mode ?? {},
  }
}

export async function loadBrains(): Promise<BrainUiPack> {
  const pack = await fetchJson<BrainUiPack>('/data/brains-ui-pack.json')
  return {
    version: pack.version ?? 1,
    brains: (pack.brains ?? []).map(normalizeBrain),
  }
}

export function findBrain(pack: BrainUiPack | null, id: string): BrainUiDef | undefined {
  return pack?.brains.find((b) => b.brain_id === id)
}

export function modeLabel(mode: string): string {
  return MODE_LABELS[mode] ?? mode.toUpperCase()
}

export function defaultParamValues(brain: BrainUiDef): BrainParamValues {
  const values: BrainParamValues = {}
  for (const param of brain.params) {
    const v = param.default ?? param.recommended
    if (v === null || v === undefined) {
      values[param.id] = param.kind === 'number' ? 0 : ''
    } else {
      values[param.id] = v
    }
  }
  return values
}

/** Width / height / steps / cfg for Comfy Cloud from BrainPanel params. */
export function generationSizeFromBrain(params: BrainParamValues | null | undefined): {
  width?: number
  height?: number
  steps?: number
  cfg?: number
} {
  if (!params) return {}
  const steps = asPositiveInt(params.steps)
  const width = asPositiveInt(params.width)
  const height = asPositiveInt(params.height)
  const match = String(params.resolution ?? '').match(/(\d+)\s*[x×]\s*(\d+)/i)
  const guidance = Number(params.guidance)
  return {
    width: width ?? (match ? Number(match[1]) : undefined),
    height: height ?? (match ? Number(match[2]) : undefined),
    steps,
    cfg: Number.isFinite(guidance) && guidance > 0 ? guidance : undefined,
  }
}

/** Cheap sampler/scheduler from the brain's free-text scheduler_family field. */
export function generationSamplerFromBrain(params: BrainParamValues | null | undefined): {
  sampler?: string
  scheduler?: string
} {
  const raw = String(params?.scheduler_family ?? '').trim().toLowerCase()
  if (!raw) return {}
  const parts = raw.split(/[/,+|]+/).map((part) => part.trim().replace(/\s+/g, '_')).filter(Boolean)
  const samplers = new Set([
    'euler',
    'euler_ancestral',
    'dpmpp_2m',
    'dpmpp_2m_sde',
    'dpmpp_sde',
    'ddim',
    'uni_pc',
    'lcm',
    'heun',
  ])
  const schedulers = new Set(['normal', 'karras', 'exponential', 'simple', 'sgm_uniform', 'ddim_uniform', 'beta'])
  return {
    sampler: parts.find((part) => samplers.has(part)),
    scheduler: parts.find((part) => schedulers.has(part)),
  }
}

function asPositiveInt(value: number | string | undefined): number | undefined {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').trim())
  if (!Number.isFinite(n) || n <= 0) return undefined
  return Math.round(n)
}

export function defaultMode(brain: BrainUiDef): string {
  if (brain.modes.includes('t2i')) return 't2i'
  return brain.modes[0] ?? 't2i'
}

/** Illustrious maps to FAMILY_CHECKPOINTS; else SDXL RealVis. Never default Flux. */
export function preferredComfyBrainId(pack: BrainUiPack): string {
  if (findBrain(pack, 'illustrious')) return 'illustrious'
  if (findBrain(pack, 'sdxl')) return 'sdxl'
  return pack.brains.find((b) => b.brain_id !== 'flux')?.brain_id ?? pack.brains[0]?.brain_id ?? ''
}

export function isExperimentalFluxBrain(brainId: string): boolean {
  return String(brainId || '').trim().toLowerCase() === 'flux'
}

export const FLUX_GENERATE_WARNING =
  'FLUX es experimental: Generar usa un grafo tipo SDXL (CheckpointLoaderSimple) y puede fallar. Illustrious o SDXL RealVis son el camino sólido.'

export function inputsForMode(brain: BrainUiDef, mode: string): BrainModeInput[] {
  return brain.inputs_by_mode[mode] ?? []
}

export function negativePlaceholder(brain: BrainUiDef): string {
  const n = brain.negatives
  return (
    n.examples_v2_0_short ||
    n.examples_api ||
    n.examples_v0_1 ||
    n.diffusers_examples ||
    n.policy ||
    n.note ||
    'Negative prompt (opcional)'
  )
}

/** Map brain → closest legacy models.json id for LoRA ceilings / export suffix. */
export function suggestModelIdForBrain(brainId: string, modelIds: string[]): string | undefined {
  const aliases: Record<string, string[]> = {
    flux: ['flux', 'krea', 'kontext'],
    illustrious: ['illustrious', 'pony'],
    sdxl: ['sdxl', 'realvis', 'juggernaut'],
    sd35: ['sd3', 'sd35', 'stable-diffusion-3'],
    ltx: ['ltx', 'video'],
    wan: ['wan', 'video'],
  }
  const keys = aliases[brainId] ?? [brainId]
  const lower = modelIds.map((id) => ({ id, l: id.toLowerCase() }))
  for (const key of keys) {
    const hit = lower.find((m) => m.l.includes(key))
    if (hit) return hit.id
  }
  return modelIds[0]
}

export function revokeRefState(refs: BrainRefState) {
  for (const list of Object.values(refs)) {
    for (const item of list) URL.revokeObjectURL(item.objectUrl)
  }
}

