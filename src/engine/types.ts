export type StudioMode = 'experimental' | 'control'
export type PromptStyle = 'natural' | 'tags' | 'hybrid' | 'instruction'
export type CameraOp = 'fixed' | 'zoom-in' | 'zoom-out'
export type Intensity = 0 | 1 | 2 | 3
export type LoraSource = 'imported' | 'catalog'
export type AffectKind = 'body' | 'scene' | 'none'

export type BlockTypeDef = {
  id: string
  label: string
  shortLabel: string
  color: string
  weight: number
  order: number
  exportRole: string
}

export type OptionVariations = {
  obvious: string[]
  unusual: string[]
}

export type OptionDef = {
  id: string
  label: string
  prompt: string
  weight: number
  tags: string[]
  incompatibleTags?: string[]
  variations?: OptionVariations
}

export type MagePlan = {
  id: string
  name: string
  maxLoras: number
  note: string
}

export type MageModel = {
  id: string
  name: string
  family: string
  placeholder: boolean
  tip: string
  strengths: string[]
  notes: string
  promptStyle: PromptStyle
  exportSuffix: string
  maxLoras: number
  loraNote?: string
  helpUrl?: string
}

export type MageMeta = {
  defaultPlanId: string
  helpUrl: string
  assistantUrl: string
  analysisStubUrl: string
  plans: MagePlan[]
}

export type LoraWeightGuide = {
  low: number
  mid: number
  high: number
  notes: {
    low: string
    mid: string
    high: string
  }
}

export type LoraDef = {
  id: string
  name: string
  placeholder: boolean
  source: LoraSource
  category: string
  categoryColor: string
  baseModels: string[]
  description: string
  keywords: string[]
  triggers: string[]
  weight: LoraWeightGuide
  tip: string
  strengths: string[]
  tags: string[]
  examplesUrl?: string
  /** Exact Comfy Cloud `lora_name` when the same file serves every brain. */
  comfyName?: string
  /** Alias of comfyName (catalog JSON may use either key). */
  comfyFile?: string
  /** Per-brain Cloud filenames (illustrious / sdxl / flux). Never a download URL. */
  comfyByBrain?: Record<string, string>
  /** checkpoint = not a LoRA; never offer Incluir. */
  role?: 'lora' | 'checkpoint'
  /** false = no matching Generar family yet (Pony / Flux.2 Klein). */
  generar?: boolean
}

export type GlossaryTerm = {
  id: string
  term: string
  text: string
}

export type SpicyLevel = {
  id: Intensity
  label: string
  prompt: string
}

export type SpicyCatalog = {
  levels: SpicyLevel[]
  exaggeration: {
    body: string[]
    scene: string[]
  }
  extras: {
    futanari: { label: string; prompt: string; hook: true }
    fluids: { label: string; prompt: string; hook: true }
  }
}

export type MicroVariationBook = {
  byType: Record<string, OptionVariations>
  byOption: Record<string, OptionVariations>
}

export type BlockValue =
  | { kind: 'option'; optionId: string }
  | { kind: 'custom'; text: string }

export type Block = {
  id: string
  type: string
  label: string
  color: string
  locked: boolean
  weight: number
  value: BlockValue | null
  meta: Record<string, unknown>
}

export type ExaggerationState = {
  body: Intensity
  scene: Intensity
  extras: {
    futanari: boolean
    fluids: boolean
  }
}

export type PromptState = {
  version: 2
  blocks: Block[]
  selectedModelId: string
  selectedLoraIds: string[]
  selectedPlanId: string
  mode: StudioMode
  spicyLevel: Intensity
  exaggeration: ExaggerationState
  cameraOp: CameraOp
  updatedAt: string
}

export type PromptSegment = {
  id: string
  type: string
  label: string
  color: string
  text: string
  affect: AffectKind
  /** True when the clause came from the coherent piloto engine. */
  coherent?: boolean
}

export type PromptDelta = {
  added: string[]
  removed: string[]
}

export type Catalog = {
  blockTypes: BlockTypeDef[]
  optionsByType: Record<string, OptionDef[]>
  models: MageModel[]
  loras: LoraDef[]
  mage: MageMeta
  glossary: GlossaryTerm[]
  spicy: SpicyCatalog
  variations: MicroVariationBook
}

export type SavedTemplate = {
  id: string
  name: string
  folderId: string
  savedAt: string
  state: PromptState
}

export type TemplateFolder = {
  id: string
  name: string
}

export const defaultExaggeration = (): ExaggerationState => ({
  body: 0,
  scene: 0,
  extras: { futanari: false, fluids: false },
})
