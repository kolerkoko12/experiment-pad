import { findOption } from './catalog'
import { excludeRecent, rememberOption } from './memory'
import { variationClause } from './variations'
import type { Block, Catalog, OptionDef } from './types'

export type Rng = () => number

function collectLockedTags(blocks: Block[], catalog: Catalog): Set<string> {
  const tags = new Set<string>()
  for (const block of blocks) {
    if (!block.locked || block.value?.kind !== 'option') continue
    const option = findOption(catalog, block.type, block.value.optionId)
    option?.tags.forEach((tag) => tags.add(tag))
  }
  return tags
}

function scoreOption(option: OptionDef, lockedTags: Set<string>, explore: boolean): number {
  const base = Math.max(option.weight, 0.05)
  if (explore || lockedTags.size === 0) return base
  const shared = option.tags.filter((tag) => lockedTags.has(tag)).length
  const clashes = (option.incompatibleTags ?? []).filter((tag) => lockedTags.has(tag)).length
  const boosted = base * (1 + 0.42 * shared)
  return clashes > 0 ? boosted * 0.08 : boosted
}

function pickWeighted(options: OptionDef[], scores: number[], rng: Rng): OptionDef {
  const total = scores.reduce((sum, score) => sum + score, 0)
  if (total <= 0) {
    return options[Math.floor(rng() * options.length)] ?? options[0]
  }
  let dart = rng() * total
  for (let i = 0; i < options.length; i += 1) {
    dart -= scores[i] ?? 0
    if (dart <= 0) return options[i] ?? options[0]
  }
  return options[options.length - 1] ?? options[0]
}

export function randomizeUnlocked(
  blocks: Block[],
  catalog: Catalog,
  rng: Rng = Math.random,
): Block[] {
  const lockedTags = collectLockedTags(blocks, catalog)

  return blocks.map((block) => {
    if (block.locked) return block
    const pool = catalog.optionsByType[block.type] ?? []
    if (pool.length === 0) return block

    const currentId = block.value?.kind === 'option' ? block.value.optionId : null
    const fresh = excludeRecent(
      block.type,
      pool.length > 1 ? pool.filter((option) => option.id !== currentId) : pool,
    )
    const explore = rng() < 0.14
    const scores = fresh.map((option) => scoreOption(option, lockedTags, explore))
    const picked = pickWeighted(fresh, scores, rng)
    rememberOption(block.type, picked.id)
    return {
      ...block,
      value: { kind: 'option', optionId: picked.id },
      meta: {
        ...block.meta,
        variation: variationClause(picked, block.type, catalog, true),
      },
    }
  })
}

export function setBlockLocked(blocks: Block[], blockId: string, locked: boolean): Block[] {
  return blocks.map((block) => (block.id === blockId ? { ...block, locked } : block))
}

export function anchorFilled(blocks: Block[]): Block[] {
  return blocks.map((block) => (block.value ? { ...block, locked: true } : block))
}

export function releaseAll(blocks: Block[]): Block[] {
  return blocks.map((block) => ({ ...block, locked: false }))
}

export function setBlockValue(
  blocks: Block[],
  blockId: string,
  value: Block['value'],
  catalog?: Catalog,
): Block[] {
  return setBlockValueWithCatalog(blocks, blockId, value, catalog ?? null)
}

function setBlockValueWithCatalog(
  blocks: Block[],
  blockId: string,
  value: Block['value'],
  catalog: Catalog | null,
): Block[] {
  return blocks.map((block) => {
    if (block.id !== blockId || block.locked) return block
    if (!catalog) return { ...block, value }
    const option =
      value?.kind === 'option' ? findOption(catalog, block.type, value.optionId) : undefined
    return {
      ...block,
      value,
      meta: {
        ...block.meta,
        variation: option ? variationClause(option, block.type, catalog, true) : '',
      },
    }
  })
}

export function applyBlockValue(
  blocks: Block[],
  blockId: string,
  value: Block['value'],
  catalog: Catalog,
): Block[] {
  return setBlockValueWithCatalog(blocks, blockId, value, catalog)
}
