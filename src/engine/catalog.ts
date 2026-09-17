import type {
  BlockTypeDef,
  Catalog,
  GlossaryTerm,
  LoraDef,
  MageMeta,
  MageModel,
  MicroVariationBook,
  OptionDef,
  SpicyCatalog,
} from './types'

type BlockTypesFile = { types: BlockTypeDef[] }
type OptionsFile = { options: Record<string, OptionDef[]> }
type ModelsFile = { models: Array<Partial<MageModel> & Pick<MageModel, 'id' | 'name'>> }
type LorasFile = { loras: Array<Partial<LoraDef> & Pick<LoraDef, 'id' | 'name'>> }
type GlossaryFile = { terms: GlossaryTerm[] }

function normalizeModel(raw: ModelsFile['models'][number]): MageModel {
  return {
    id: raw.id,
    name: raw.name,
    family: raw.family ?? '',
    placeholder: raw.placeholder ?? false,
    tip: raw.tip ?? '',
    strengths: raw.strengths ?? [],
    notes: raw.notes ?? '',
    promptStyle: raw.promptStyle ?? 'natural',
    exportSuffix: raw.exportSuffix ?? '',
    maxLoras: raw.maxLoras ?? 0,
    loraNote: raw.loraNote,
    helpUrl: raw.helpUrl,
  }
}

function normalizeLora(raw: LorasFile['loras'][number]): LoraDef {
  const notes = raw.weight?.notes
  const url = raw.examplesUrl?.trim() ?? ''
  const generic = url === 'https://civitai.com/models' || url === 'https://www.mage.space/'
  return {
    id: raw.id,
    name: raw.name,
    placeholder: raw.placeholder ?? false,
    source: raw.source === 'imported' ? 'imported' : 'catalog',
    category: raw.category ?? 'Catálogo',
    categoryColor: raw.categoryColor ?? '#A78BFA',
    baseModels: raw.baseModels ?? [],
    description: raw.description ?? raw.tip ?? '',
    keywords: raw.keywords ?? [],
    triggers: raw.triggers ?? raw.keywords ?? [],
    weight: {
      low: raw.weight?.low ?? 0.3,
      mid: raw.weight?.mid ?? 0.6,
      high: raw.weight?.high ?? 0.9,
      notes: {
        low: notes?.low ?? 'Toque suave.',
        mid: notes?.mid ?? 'Punto de partida.',
        high: notes?.high ?? 'Solo si no marca.',
      },
    },
    tip: raw.tip ?? '',
    strengths: raw.strengths ?? [],
    tags: raw.tags ?? [],
    examplesUrl: url && !generic ? url : undefined,
    comfyName: cleanComfyFilename(raw.comfyName),
    comfyFile: cleanComfyFilename(raw.comfyFile),
    comfyByBrain: normalizeComfyByBrain(raw.comfyByBrain),
    role: inferLoraRole(raw),
    generar: inferLoraGenerar(raw),
  }
}

function inferLoraRole(raw: LorasFile['loras'][number]): LoraDef['role'] {
  if (raw.role === 'checkpoint') return 'checkpoint'
  const id = String(raw.id || '')
  if (id === 'prefectious-xl-nsfw' || id === 'persephone-flux-nsfw') return 'checkpoint'
  return 'lora'
}

function inferLoraGenerar(raw: LorasFile['loras'][number]): boolean {
  if (raw.generar === false) return false
  if (inferLoraRole(raw) === 'checkpoint') return false
  const id = String(raw.id || '').toLowerCase()
  if (id.includes('klein')) return false
  const bases = (raw.baseModels ?? []).map((item) => item.toLowerCase())
  if (bases.some((base) => base.includes('pony'))) return false
  return true
}

function cleanComfyFilename(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const name = value.trim()
  if (!name || name === 'null') return undefined
  if (/[\\/]/.test(name) || name.includes('..') || /https?:/i.test(name)) return undefined
  return name
}

function normalizeComfyByBrain(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const name = cleanComfyFilename(value)
    const brain = key.trim().toLowerCase()
    if (name && brain) out[brain] = name
  }
  return Object.keys(out).length > 0 ? out : undefined
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`No se pudo cargar ${url} (${res.status})`)
  }
  return (await res.json()) as T
}

const emptyVariations: MicroVariationBook = { byType: {}, byOption: {} }

const fallbackSpicy: SpicyCatalog = {
  levels: [{ id: 0, label: 'Neutro', prompt: '' }],
  exaggeration: { body: [''], scene: [''] },
  extras: {
    futanari: { label: 'Futanari', prompt: '', hook: true },
    fluids: { label: 'Fluidos', prompt: '', hook: true },
  },
}

const fallbackMage: MageMeta = {
  defaultPlanId: 'proPlus',
  helpUrl: 'https://www.mage.space/membership',
  assistantUrl: 'https://www.mage.space/',
  analysisStubUrl: 'https://www.mage.space/',
  plans: [{ id: 'proPlus', name: 'Pro Plus', maxLoras: 5, note: 'Hasta 5 LoRAs.' }],
}

export async function loadCatalog(): Promise<Catalog> {
  const [blockTypesFile, optionsFile, modelsFile, lorasFile, mage, glossaryFile, spicy, variations] =
    await Promise.all([
      fetchJson<BlockTypesFile>('/data/block-types.json'),
      fetchJson<OptionsFile>('/data/options.json'),
      fetchJson<ModelsFile>('/data/models.json'),
      fetchJson<LorasFile>('/data/loras.json'),
      fetchJson<MageMeta>('/data/mage.json').catch(() => fallbackMage),
      fetchJson<GlossaryFile>('/data/glossary.json').catch(() => ({ terms: [] as GlossaryTerm[] })),
      fetchJson<SpicyCatalog>('/data/spicy.json').catch(() => fallbackSpicy),
      fetchJson<MicroVariationBook>('/data/micro-variations.json').catch(() => emptyVariations),
    ])

  const blockTypes = [...blockTypesFile.types].sort((a, b) => a.order - b.order)
  const optionsByType: Record<string, OptionDef[]> = {}

  for (const type of blockTypes) {
    const list = optionsFile.options[type.id]
    if (!list || list.length === 0) {
      throw new Error(`El tipo "${type.id}" no tiene opciones en options.json`)
    }
    optionsByType[type.id] = list
  }

  const loras = lorasFile.loras
    .map(normalizeLora)
    .sort((a, b) => {
      if (a.source !== b.source) return a.source === 'imported' ? -1 : 1
      return a.name.localeCompare(b.name, 'es')
    })

  return {
    blockTypes,
    optionsByType,
    models: modelsFile.models.map(normalizeModel),
    loras,
    mage,
    glossary: glossaryFile.terms,
    spicy,
    variations,
  }
}

export function findModel(catalog: Catalog, id: string): MageModel | undefined {
  return catalog.models.find((model) => model.id === id)
}

export function findOption(
  catalog: Catalog,
  type: string,
  optionId: string,
): OptionDef | undefined {
  return catalog.optionsByType[type]?.find((option) => option.id === optionId)
}

export function findPlan(catalog: Catalog, planId: string) {
  return catalog.mage.plans.find((plan) => plan.id === planId) ?? catalog.mage.plans[0]
}
