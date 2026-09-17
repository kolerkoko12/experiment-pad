import { findOption, findPlan } from './catalog'
import type { Block, Catalog, LoraDef, MageModel, PromptState } from './types'

export function findLora(catalog: Catalog, id: string): LoraDef | undefined {
  return catalog.loras.find((lora) => lora.id === id)
}

export function loraKeywordText(lora: LoraDef): string {
  return lora.keywords.map((item) => item.trim()).filter(Boolean).join(', ')
}

export function loraTriggerText(lora: LoraDef): string {
  const source = lora.triggers.length > 0 ? lora.triggers : lora.keywords
  return source.map((item) => item.trim()).filter(Boolean).join(', ')
}

export function selectedLoras(state: PromptState, catalog: Catalog): LoraDef[] {
  const seen = new Set<string>()
  const list: LoraDef[] = []
  for (const id of state.selectedLoraIds) {
    if (seen.has(id)) continue
    const lora = findLora(catalog, id)
    if (!lora) continue
    seen.add(id)
    list.push(lora)
  }
  return list
}

export function selectedLoraTokens(state: PromptState, catalog: Catalog): string[] {
  return selectedLoras(state, catalog)
    .map(loraTriggerText)
    .filter((text) => text.length > 0)
}

export const MAX_COMFY_LORAS = 3

/** Slot ceiling for Incluir / Generar. Mage plans must not cap below this. */
export function comfyLoraSlotLimit(): number {
  return MAX_COMFY_LORAS
}

export type LoraIncludeKind = 'include' | 'checkpoint' | 'no-family'

export function loraIncludeKind(lora: LoraDef): LoraIncludeKind {
  if (lora.role === 'checkpoint') return 'checkpoint'
  if (lora.generar === false) return 'no-family'
  return 'include'
}

export function loraAllowsInclude(lora: LoraDef): boolean {
  return loraIncludeKind(lora) === 'include'
}

export type LoraCloudSplit = {
  cloud: number
  text: number
  total: number
}

export function selectedLoraCloudSplit(
  state: PromptState,
  catalog: Catalog,
  brainId?: string,
): LoraCloudSplit {
  const selected = selectedLoras(state, catalog)
  const cloud = selected.filter((lora) => loraIsOnComfy(lora, brainId)).length
  return { cloud, text: selected.length - cloud, total: selected.length }
}

export function loraCloudStatusCopy(split: LoraCloudSplit): {
  tone: 'empty' | 'cloud' | 'text' | 'mixed'
  line: string
} {
  const counts = `${split.cloud} en Cloud / ${split.text} solo texto`
  if (split.total === 0) return { tone: 'empty', line: `0 incluidas · ${counts}` }
  if (split.text === 0) return { tone: 'cloud', line: `${split.total} incluidas · ${counts}` }
  if (split.cloud === 0) return { tone: 'text', line: `${split.total} incluidas · ${counts}` }
  return { tone: 'mixed', line: `${split.total} incluidas · ${counts}` }
}

export type ComfyLoraRef = {
  name: string
  strength_model: number
  strength_clip: number
}

/** Exact Cloud `lora_name` for this brain, or null → trigger-only (no weights on device). */
export function resolveLoraComfyName(lora: LoraDef, brainId?: string): string | null {
  const brain = String(brainId || '')
    .trim()
    .toLowerCase()
  const mapped = lora.comfyByBrain
  if (mapped) {
    if (brain && mapped[brain]) return mapped[brain]
    if (brain.includes('illustrious') && mapped.illustrious) return mapped.illustrious
    if (brain.includes('flux') && mapped.flux) return mapped.flux
    if ((brain.includes('sdxl') || brain.includes('realvis') || brain.includes('realista')) && mapped.sdxl) {
      return mapped.sdxl
    }
  }
  return lora.comfyName || lora.comfyFile || null
}

export function loraIsOnComfy(lora: LoraDef, brainId?: string): boolean {
  if (!loraAllowsInclude(lora)) return false
  return resolveLoraComfyName(lora, brainId) !== null
}

export function selectedComfyLoras(
  state: PromptState,
  catalog: Catalog,
  brainId?: string,
  limit = MAX_COMFY_LORAS,
): ComfyLoraRef[] {
  const out: ComfyLoraRef[] = []
  for (const lora of selectedLoras(state, catalog)) {
    if (out.length >= limit) break
    if (!loraAllowsInclude(lora)) continue
    const name = resolveLoraComfyName(lora, brainId)
    if (!name) continue
    const weight = lora.weight.mid
    out.push({ name, strength_model: weight, strength_clip: weight })
  }
  return out
}

export function selectedTextOnlyLoras(
  state: PromptState,
  catalog: Catalog,
  brainId?: string,
): LoraDef[] {
  return selectedLoras(state, catalog).filter((lora) => !loraIsOnComfy(lora, brainId))
}

export function normalizeLoraIds(ids: string[] | undefined, catalog: Catalog): string[] {
  if (!ids) return []
  const known = new Set(catalog.loras.map((lora) => lora.id))
  return [...new Set(ids.filter((id) => known.has(id)))]
}

export function toggleLoraSelection(ids: string[], loraId: string): string[] {
  return ids.includes(loraId) ? ids.filter((id) => id !== loraId) : [...ids, loraId]
}

export function effectiveLoraLimit(catalog: Catalog, model: MageModel | undefined, planId: string): number {
  const plan = findPlan(catalog, planId)
  const planMax = plan?.maxLoras ?? 5
  const mageCap = !model || model.maxLoras <= 0 ? 0 : Math.min(model.maxLoras, planMax)
  // Comfy Generar allows 3 LoRAs; never let Mage Free / Flux-2 techo hide that.
  return Math.max(MAX_COMFY_LORAS, mageCap)
}

export function modelLoraLimit(model: MageModel | undefined): number {
  return model?.maxLoras ?? 0
}

export function isOverLoraLimit(selectedCount: number, max: number): boolean {
  return max > 0 && selectedCount > max
}

export function isAtLoraLimit(selectedCount: number, max: number): boolean {
  return max > 0 && selectedCount >= max
}

export function loraFitsModel(lora: LoraDef, modelId: string): boolean {
  if (lora.baseModels.length === 0) return true
  if (lora.baseModels.includes(modelId)) return true
  const id = modelId.toLowerCase()
  return lora.baseModels.some((base) => {
    const key = base.toLowerCase()
    return id === key || id.startsWith(`${key}-`) || id.includes(key)
  })
}

function lockedSceneTags(blocks: Block[], catalog: Catalog): Set<string> {
  const tags = new Set<string>()
  for (const block of blocks) {
    if (!block.locked || block.value?.kind !== 'option') continue
    const option = findOption(catalog, block.type, block.value.optionId)
    option?.tags.forEach((tag) => tags.add(tag))
  }
  return tags
}

export function suggestLorasForScene(
  state: PromptState,
  catalog: Catalog,
  limit = 2,
): LoraDef[] {
  const lockedTags = lockedSceneTags(state.blocks, catalog)
  const scored = catalog.loras
    .filter((lora) => loraAllowsInclude(lora) && loraFitsModel(lora, state.selectedModelId))
    .map((lora) => {
      const overlap = lora.tags.filter((tag) => lockedTags.has(tag)).length
      const strengthHit = lora.strengths.some((item) => lockedTags.has(item.toLowerCase()))
      return { lora, score: overlap * 2 + (strengthHit ? 1 : 0) + lora.weight.mid / 10 }
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)

  const picked: LoraDef[] = []
  for (const row of scored) {
    if (picked.length >= limit) break
    if (state.selectedLoraIds.includes(row.lora.id)) continue
    picked.push(row.lora)
  }
  return picked
}

export function lorasByCategory(
  loras: LoraDef[],
  brainId?: string,
): { category: string; color: string; items: LoraDef[] }[] {
  const map = new Map<string, { color: string; items: LoraDef[] }>()
  for (const lora of loras) {
    const key = `${lora.source}:${lora.category}`
    const bucket = map.get(key) ?? { color: lora.categoryColor, items: [] }
    bucket.items.push(lora)
    map.set(key, bucket)
  }
  return [...map.entries()].map(([key, value]) => ({
    category: key.startsWith('imported:') ? `Importadas · ${value.items[0]?.category}` : (value.items[0]?.category ?? key),
    color: value.color,
    items: [...value.items].sort((a, b) => {
      const aCloud = loraIsOnComfy(a, brainId) ? 0 : 1
      const bCloud = loraIsOnComfy(b, brainId) ? 0 : 1
      if (aCloud !== bCloud) return aCloud - bCloud
      return a.name.localeCompare(b.name, 'es')
    }),
  }))
}

export function lorasMatchingPanelFilter(
  loras: LoraDef[],
  brainId: string | undefined,
  filter: 'cloud' | 'all',
): LoraDef[] {
  if (filter !== 'cloud') return loras
  return loras.filter((lora) => loraIsOnComfy(lora, brainId))
}
