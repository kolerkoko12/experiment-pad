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
  if (!model || model.maxLoras <= 0) return 0
  return Math.min(model.maxLoras, planMax)
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
  return lora.baseModels.length === 0 || lora.baseModels.includes(modelId)
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
    .filter((lora) => loraFitsModel(lora, state.selectedModelId))
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

export function lorasByCategory(loras: LoraDef[]): { category: string; color: string; items: LoraDef[] }[] {
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
    items: value.items,
  }))
}
