import { findOption } from './catalog'
import type { Block, Catalog } from './types'

export type ParsedAssignment = {
  blockId: string
  type: string
  label: string
  color: string
  optionId?: string
  custom?: string
  confidence: 'alta' | 'media' | 'baja'
}

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-záéíóúüñ0-9]+/i)
    .filter((part) => part.length > 2)
}

function score(haystack: string, parts: string[]): number {
  const bag = new Set(tokens(haystack))
  return parts.reduce((sum, part) => sum + (bag.has(part) ? 1 : 0), 0)
}

/** Best-effort: comma/line clauses → block types. User can reassign in UI. */
export function parseMageAnalysis(text: string, blocks: Block[], catalog: Catalog): ParsedAssignment[] {
  const clauses = text
    .split(/[\n;|]+|(?<=\w),\s+/)
    .map((item) => item.replace(/^[-*•]\s*/, '').trim())
    .filter((item) => item.length > 3)

  const used = new Set<string>()
  const out: ParsedAssignment[] = []

  for (const clause of clauses) {
    const parts = tokens(clause)
    let best: { block: Block; optionId?: string; n: number } | null = null
    for (const block of blocks) {
      const options = catalog.optionsByType[block.type] ?? []
      for (const option of options) {
        if (used.has(`${block.id}:${option.id}`)) continue
        const n = score(`${option.label} ${option.prompt}`, parts)
        if (!best || n > best.n) best = { block, optionId: option.id, n }
      }
      const typeScore = score(block.label, parts)
      if (typeScore > 0 && (!best || typeScore > best.n)) {
        best = { block, n: typeScore }
      }
    }
    if (!best || best.n < 1) continue
    used.add(`${best.block.id}:${best.optionId ?? clause}`)
    const option = best.optionId ? findOption(catalog, best.block.type, best.optionId) : undefined
    out.push({
      blockId: best.block.id,
      type: best.block.type,
      label: best.block.label,
      color: best.block.color,
      optionId: best.optionId,
      custom: option ? undefined : clause,
      confidence: best.n >= 3 ? 'alta' : best.n === 2 ? 'media' : 'baja',
    })
  }
  return out
}
