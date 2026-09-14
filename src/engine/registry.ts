import type { Block, Catalog } from './types'

/** Builds the ordered block list from the JSON registry. New types appear automatically. */
export function createBlocksFromCatalog(catalog: Catalog): Block[] {
  return catalog.blockTypes.map((type) => ({
    id: `block-${type.id}`,
    type: type.id,
    label: type.label,
    color: type.color,
    locked: false,
    weight: type.weight,
    value: null,
    meta: { exportRole: type.exportRole, shortLabel: type.shortLabel },
  }))
}

export function mergeBlocksWithCatalog(blocks: Block[], catalog: Catalog): Block[] {
  const byType = new Map(blocks.map((block) => [block.type, block]))
  return catalog.blockTypes.map((type) => {
    const existing = byType.get(type.id)
    if (existing) {
      return {
        ...existing,
        label: type.label,
        color: type.color,
        weight: type.weight,
        meta: { ...existing.meta, exportRole: type.exportRole, shortLabel: type.shortLabel },
      }
    }
    return {
      id: `block-${type.id}`,
      type: type.id,
      label: type.label,
      color: type.color,
      locked: false,
      weight: type.weight,
      value: null,
      meta: { exportRole: type.exportRole, shortLabel: type.shortLabel },
    }
  })
}
