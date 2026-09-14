import { findOption } from './catalog'
import {
  applySemanticScene,
  buildSemanticScene,
  collectPilotoTags,
  indexPiloto,
  pilotoIsUsable,
  tagsFromScene,
  type ConceptsPiloto,
} from './coherent'
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

export type RandomizeOpts = {
  piloto?: ConceptsPiloto | null
  useCoherentPilot?: boolean
  /** If set, only these unlocked types are rerolled (others stay as-is). */
  onlyTypes?: string[]
}

export function blockFingerprint(blocks: Block[]): string {
  return blocks
    .map((block) => {
      const value =
        block.value?.kind === 'option'
          ? `o:${block.value.optionId}`
          : block.value?.kind === 'custom'
            ? `c:${block.value.text}`
            : 'empty'
      return `${block.id}:${block.locked ? 1 : 0}:${value}:${block.meta.coherent === true ? 1 : 0}`
    })
    .join('|')
}

function randomizeBlockOption(
  block: Block,
  catalog: Catalog,
  lockedTags: Set<string>,
  rng: Rng,
): Block {
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
      coherent: false,
      pilotoConceptIds: undefined,
      compatibility: undefined,
      variation: variationClause(picked, block.type, catalog, true),
    },
  }
}

export function randomizeUnlocked(
  blocks: Block[],
  catalog: Catalog,
  rng: Rng = Math.random,
  opts?: RandomizeOpts,
): Block[] {
  const usePilot = pilotoIsUsable(opts?.piloto, opts?.useCoherentPilot)
  const graph = usePilot && opts?.piloto ? indexPiloto(opts.piloto) : null

  let working = blocks
  const extraTags = new Set<string>()
  if (graph) {
    const scene = buildSemanticScene(blocks, graph, catalog, rng)
    working = applySemanticScene(blocks, scene, graph)
    tagsFromScene(scene).forEach((tag) => extraTags.add(tag))
    collectPilotoTags(working, graph).forEach((tag) => extraTags.add(tag))
  }

  const lockedTags = new Set([...collectLockedTags(working, catalog), ...extraTags])

  return working.map((block) => {
    if (block.locked) return block
    if (opts?.onlyTypes && !opts.onlyTypes.includes(block.type)) return block
    if (graph && block.meta.coherent === true) return block
    return randomizeBlockOption(block, catalog, lockedTags, rng)
  })
}

/** Same locked + non-piloto blocks; ON fills scene/luz/ropa/cuerpo from the graph. */
export function randomizePilotPair(
  blocks: Block[],
  catalog: Catalog,
  piloto: ConceptsPiloto | null | undefined,
  rng: Rng = Math.random,
  scope: 'all-unlocked' | 'piloto-types' = 'all-unlocked',
): { on: Block[]; off: Block[] } {
  const types = piloto?.pilotBlockTypes
  const onlyTypes = scope === 'piloto-types' && types && types.length > 0 ? types : undefined
  const off = randomizeUnlocked(blocks, catalog, rng, {
    piloto,
    useCoherentPilot: false,
    onlyTypes,
  })
  if (!pilotoIsUsable(piloto, true)) {
    return { on: off, off }
  }
  const graph = indexPiloto(piloto)
  const scene = buildSemanticScene(off, graph, catalog, rng)
  return { on: applySemanticScene(off, scene, graph), off }
}

export function pairContainsBlocks(
  pair: { on: Block[]; off: Block[] } | null | undefined,
  blocks: Block[],
): boolean {
  if (!pair) return false
  const fp = blockFingerprint(blocks)
  return fp === blockFingerprint(pair.on) || fp === blockFingerprint(pair.off)
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
        coherent: false,
        pilotoConceptIds: undefined,
        compatibility: undefined,
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
