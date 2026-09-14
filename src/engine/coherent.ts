import { findOption } from './catalog'
import type { Block, Catalog } from './types'

type Rng = () => number

export type Compatibility = 'green' | 'yellow' | 'red'

export type ConceptConsequence = {
  id: string
  weight: number
  tags?: string[]
}

export type ConceptDef = {
  id: string
  label: string
  prompt: string
  weight: number
  tags: string[]
  blockTypes: string[]
  relations: string[]
  consequences: ConceptConsequence[]
  incompatibilities?: string[]
}

export type ConceptsPiloto = {
  version?: number
  note?: string
  useCoherentPilot?: boolean
  /** Default scene-related types the piloto may fill. */
  pilotBlockTypes?: string[]
  concepts: ConceptDef[]
}

export type ConceptGraph = {
  concepts: ConceptDef[]
  byId: Map<string, ConceptDef>
  pilotBlockTypes: Set<string>
  useCoherentPilot: boolean
}

export type SemanticAssignment = {
  text: string
  conceptIds: string[]
  compatibility: Compatibility
}

export type SemanticScene = {
  seeds: ConceptDef[]
  active: ConceptDef[]
  byType: Record<string, SemanticAssignment>
  compatibility: Compatibility
}

const DEFAULT_PILOT_TYPES = ['scene', 'lighting', 'clothing', 'physique'] as const

const RENDER_ORDER = [
  'noche',
  'piscina',
  'lluvia',
  'agua',
  'humedad',
  'reflejos',
  'cuero',
  'ropa_mojada',
  'piel_mojada',
]

/** Tags that justify overlaying piloto consequences onto a locked option scene. */
const STRONG_TAGS = new Set(['water', 'rain', 'pool', 'wet', 'leather', 'humidity', 'reflection'])

const ALWAYS_CONSEQUENCE = 0.8

function pickWeighted<T>(items: T[], scores: number[], rng: Rng): T | undefined {
  if (items.length === 0) return undefined
  const total = scores.reduce((sum, score) => sum + score, 0)
  if (total <= 0) return items[Math.floor(rng() * items.length)] ?? items[0]
  let dart = rng() * total
  for (let i = 0; i < items.length; i += 1) {
    dart -= scores[i] ?? 0
    if (dart <= 0) return items[i]
  }
  return items[items.length - 1]
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0)
}

function normalizeConcept(raw: Record<string, unknown>): ConceptDef | null {
  const id = typeof raw.id === 'string' ? raw.id.trim() : ''
  if (!id) return null
  const prompt =
    (typeof raw.prompt === 'string' && raw.prompt) ||
    (typeof raw.scene === 'string' && raw.scene) ||
    ''
  const consequencesRaw = Array.isArray(raw.consequences) ? raw.consequences : []
  const consequences: ConceptConsequence[] = []
  for (const row of consequencesRaw) {
    if (!row || typeof row !== 'object') continue
    const rec = row as Record<string, unknown>
    const cid = typeof rec.id === 'string' ? rec.id : ''
    if (!cid) continue
    consequences.push({
      id: cid,
      weight: typeof rec.weight === 'number' ? rec.weight : 1,
      tags: asStringArray(rec.tags),
    })
  }
  return {
    id,
    label: typeof raw.label === 'string' && raw.label ? raw.label : id,
    prompt,
    weight: typeof raw.weight === 'number' ? raw.weight : 1,
    tags: asStringArray(raw.tags),
    blockTypes: asStringArray(raw.blockTypes).length > 0 ? asStringArray(raw.blockTypes) : ['scene'],
    relations: asStringArray(raw.relations),
    consequences,
    incompatibilities: asStringArray(raw.incompatibilities),
  }
}

export function normalizePiloto(raw: unknown): ConceptsPiloto | null {
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as Record<string, unknown>
  const list = Array.isArray(rec.concepts) ? rec.concepts : []
  const concepts: ConceptDef[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const concept = normalizeConcept(item as Record<string, unknown>)
    if (concept) concepts.push(concept)
  }
  if (concepts.length === 0) return null
  return {
    version: typeof rec.version === 'number' ? rec.version : 1,
    note: typeof rec.note === 'string' ? rec.note : undefined,
    useCoherentPilot: rec.useCoherentPilot !== false,
    pilotBlockTypes:
      asStringArray(rec.pilotBlockTypes).length > 0
        ? asStringArray(rec.pilotBlockTypes)
        : [...DEFAULT_PILOT_TYPES],
    concepts,
  }
}

export function indexPiloto(data: ConceptsPiloto): ConceptGraph {
  const concepts = data.concepts.filter((concept) => concept.id)
  return {
    concepts,
    byId: new Map(concepts.map((concept) => [concept.id, concept])),
    pilotBlockTypes: new Set(
      data.pilotBlockTypes && data.pilotBlockTypes.length > 0
        ? data.pilotBlockTypes
        : DEFAULT_PILOT_TYPES,
    ),
    useCoherentPilot: data.useCoherentPilot !== false,
  }
}

export function pilotoIsUsable(
  piloto: ConceptsPiloto | null | undefined,
  useCoherentPilot?: boolean,
): piloto is ConceptsPiloto {
  if (!piloto || piloto.concepts.length === 0) return false
  if (useCoherentPilot === false) return false
  if (useCoherentPilot === undefined && piloto.useCoherentPilot === false) return false
  return true
}

function worseCompat(a: Compatibility, b: Compatibility): Compatibility {
  if (a === 'red' || b === 'red') return 'red'
  if (a === 'yellow' || b === 'yellow') return 'yellow'
  return 'green'
}

function optionIncompatibleTags(block: Block, catalog: Catalog): string[] {
  if (block.value?.kind !== 'option') return []
  const option = findOption(catalog, block.type, block.value.optionId)
  return option?.incompatibleTags ?? []
}

export function compatibilityCheck(
  concept: ConceptDef,
  context: {
    lockedIds: Set<string>
    lockedTags: Set<string>
    lockedIncompatibleTags?: Set<string>
    graph: ConceptGraph
  },
): Compatibility {
  for (const lockedId of context.lockedIds) {
    if (lockedId === concept.id) continue
    const locked = context.graph.byId.get(lockedId)
    if (locked?.incompatibilities?.includes(concept.id)) return 'red'
    if (concept.incompatibilities?.includes(lockedId)) return 'red'
  }
  if (context.lockedIncompatibleTags) {
    for (const tag of concept.tags) {
      if (context.lockedIncompatibleTags.has(tag)) return 'red'
    }
  }
  if (context.lockedTags.size === 0 && context.lockedIds.size === 0) return 'green'
  const shared = concept.tags.filter((tag) => context.lockedTags.has(tag)).length
  return shared > 0 ? 'green' : 'yellow'
}

export function pickConcept(
  graph: ConceptGraph,
  opts: {
    rng: Rng
    pool?: ConceptDef[]
    lockedIds?: Set<string>
    lockedTags?: Set<string>
    lockedIncompatibleTags?: Set<string>
    exclude?: Set<string>
    preferBlockType?: string
  },
): ConceptDef | undefined {
  let pool = opts.pool ?? graph.concepts
  if (opts.preferBlockType) {
    const typed = pool.filter((concept) => concept.blockTypes.includes(opts.preferBlockType!))
    if (typed.length > 0) pool = typed
  }
  if (opts.exclude && opts.exclude.size > 0) {
    pool = pool.filter((concept) => !opts.exclude!.has(concept.id))
  }
  const lockedIds = opts.lockedIds ?? new Set<string>()
  const lockedTags = opts.lockedTags ?? new Set<string>()
  const viable: ConceptDef[] = []
  const scores: number[] = []
  for (const concept of pool) {
    const compat = compatibilityCheck(concept, {
      lockedIds,
      lockedTags,
      lockedIncompatibleTags: opts.lockedIncompatibleTags,
      graph,
    })
    if (compat === 'red') continue
    const shared = concept.tags.filter((tag) => lockedTags.has(tag)).length
    const boost = compat === 'green' ? 1 + 0.42 * shared : 0.55
    viable.push(concept)
    scores.push(Math.max(concept.weight, 0.05) * boost)
  }
  return pickWeighted(viable, scores, opts.rng)
}

export function expandConsequences(
  seeds: ConceptDef[],
  graph: ConceptGraph,
  opts: {
    rng: Rng
    lockedIds?: Set<string>
    lockedTags?: Set<string>
    lockedIncompatibleTags?: Set<string>
    maxExtra?: number
  },
): ConceptDef[] {
  const active = new Map<string, ConceptDef>()
  for (const seed of seeds) active.set(seed.id, seed)

  type Candidate = { concept: ConceptDef; weight: number }
  const candidates: Candidate[] = []
  const seen = new Set<string>(active.keys())
  const lockedIds = opts.lockedIds ?? new Set<string>()
  const lockedTags = opts.lockedTags ?? new Set<string>()

  const consider = (id: string, weight: number) => {
    const concept = graph.byId.get(id)
    if (!concept || seen.has(concept.id)) return
    const compat = compatibilityCheck(concept, {
      lockedIds,
      lockedTags,
      lockedIncompatibleTags: opts.lockedIncompatibleTags,
      graph,
    })
    if (compat === 'red') return
    seen.add(concept.id)
    const boosted = compat === 'green' ? weight * 1.15 : weight * 0.75
    candidates.push({ concept, weight: boosted })
  }

  for (const seed of seeds) {
    for (const row of seed.consequences) consider(row.id, row.weight)
    for (const relId of seed.relations) {
      const related = graph.byId.get(relId)
      consider(relId, (related?.weight ?? 1) * 0.42)
    }
  }

  candidates.sort((a, b) => b.weight - a.weight)
  const maxExtra = opts.maxExtra ?? 6
  for (const candidate of candidates) {
    if (active.size >= seeds.length + maxExtra) break
    if (candidate.weight >= ALWAYS_CONSEQUENCE || opts.rng() < Math.min(1, Math.max(0.12, candidate.weight))) {
      active.set(candidate.concept.id, candidate.concept)
    }
  }

  return [...active.values()]
}

export function renderConceptPrompt(concepts: ConceptDef[]): string {
  const rank = (id: string) => {
    const idx = RENDER_ORDER.indexOf(id)
    return idx === -1 ? RENDER_ORDER.length : idx
  }
  return [...concepts]
    .sort((a, b) => rank(a.id) - rank(b.id))
    .map((concept) => concept.prompt.trim())
    .filter(Boolean)
    .join(', ')
}

function renderByType(
  active: ConceptDef[],
  compatibility: Compatibility,
): Record<string, SemanticAssignment> {
  const grouped = new Map<string, ConceptDef[]>()
  for (const concept of active) {
    for (const type of concept.blockTypes) {
      const list = grouped.get(type) ?? []
      if (!list.some((item) => item.id === concept.id)) list.push(concept)
      grouped.set(type, list)
    }
  }
  const byType: Record<string, SemanticAssignment> = {}
  for (const [type, list] of grouped) {
    byType[type] = {
      text: renderConceptPrompt(list),
      conceptIds: list.map((concept) => concept.id),
      compatibility,
    }
  }
  return byType
}

function idsFromMeta(block: Block): string[] {
  const raw = block.meta.pilotoConceptIds
  return asStringArray(raw)
}

export function collectLockedConceptIds(blocks: Block[], graph: ConceptGraph): Set<string> {
  const ids = new Set<string>()
  for (const block of blocks) {
    if (!block.locked) continue
    for (const id of idsFromMeta(block)) {
      if (graph.byId.has(id)) ids.add(id)
    }
    if (block.value?.kind === 'custom') {
      const text = block.value.text
      for (const concept of graph.concepts) {
        if (text.includes(concept.id) || (concept.prompt && text.includes(concept.prompt))) {
          ids.add(concept.id)
        }
      }
    }
  }
  return ids
}

export function collectLockedIncompatibleTags(blocks: Block[], catalog: Catalog): Set<string> {
  const tags = new Set<string>()
  for (const block of blocks) {
    if (!block.locked) continue
    for (const tag of optionIncompatibleTags(block, catalog)) tags.add(tag)
  }
  return tags
}

export function collectPilotoTags(blocks: Block[], graph: ConceptGraph): Set<string> {
  const tags = new Set<string>()
  for (const block of blocks) {
    if (!block.locked) continue
    for (const id of idsFromMeta(block)) {
      graph.byId.get(id)?.tags.forEach((tag) => tags.add(tag))
    }
  }
  return tags
}

function matchConceptsByTags(graph: ConceptGraph, tags: Set<string>): ConceptDef[] {
  if (tags.size === 0) return []
  return graph.concepts
    .map((concept) => ({
      concept,
      n: concept.tags.filter((tag) => tags.has(tag)).length,
      strong: concept.tags.some((tag) => tags.has(tag) && STRONG_TAGS.has(tag)),
    }))
    .filter((row) => row.n >= 2 || row.strong)
    .sort((a, b) => b.n - a.n || b.concept.weight - a.concept.weight)
    .map((row) => row.concept)
}

function sceneCompatibility(
  active: ConceptDef[],
  lockedIds: Set<string>,
  lockedTags: Set<string>,
  lockedIncompatibleTags: Set<string>,
  graph: ConceptGraph,
): Compatibility {
  let worst: Compatibility = 'green'
  for (const concept of active) {
    worst = worseCompat(
      worst,
      compatibilityCheck(concept, { lockedIds, lockedTags, lockedIncompatibleTags, graph }),
    )
  }
  return worst
}

export function buildSemanticScene(
  blocks: Block[],
  graph: ConceptGraph,
  catalog: Catalog,
  rng: Rng,
): SemanticScene {
  const lockedIds = collectLockedConceptIds(blocks, graph)
  const lockedTags = new Set<string>()
  for (const block of blocks) {
    if (!block.locked || block.value?.kind !== 'option') continue
    const option = findOption(catalog, block.type, block.value.optionId)
    option?.tags.forEach((tag) => lockedTags.add(tag))
  }
  collectPilotoTags(blocks, graph).forEach((tag) => lockedTags.add(tag))
  const lockedIncompatibleTags = collectLockedIncompatibleTags(blocks, catalog)

  const sceneBlock = blocks.find((block) => block.type === 'scene')
  const seeds: ConceptDef[] = []
  const seen = new Set<string>()
  const pushSeed = (concept: ConceptDef | undefined) => {
    if (!concept || seen.has(concept.id)) return
    seen.add(concept.id)
    seeds.push(concept)
  }

  for (const id of lockedIds) pushSeed(graph.byId.get(id))

  if (sceneBlock && !sceneBlock.locked) {
    pushSeed(
      pickConcept(graph, {
        rng,
        preferBlockType: 'scene',
        lockedIds,
        lockedTags,
        lockedIncompatibleTags,
        exclude: seen,
      }),
    )
  } else if (seeds.length === 0 && sceneBlock?.locked) {
    for (const matched of matchConceptsByTags(graph, lockedTags).slice(0, 2)) pushSeed(matched)
  }

  if (seeds.length === 0 && sceneBlock && !sceneBlock.locked) {
    pushSeed(
      pickConcept(graph, {
        rng,
        preferBlockType: 'scene',
        lockedIds,
        lockedTags,
        lockedIncompatibleTags,
      }),
    )
  }

  if (seeds.length === 0) {
    return { seeds: [], active: [], byType: {}, compatibility: 'green' }
  }

  const active = expandConsequences(seeds, graph, {
    rng,
    lockedIds,
    lockedTags,
    lockedIncompatibleTags,
    maxExtra: 6,
  })
  const compatibility = sceneCompatibility(
    active,
    lockedIds,
    lockedTags,
    lockedIncompatibleTags,
    graph,
  )
  return {
    seeds,
    active,
    byType: renderByType(active, compatibility),
    compatibility,
  }
}

export function tagsFromScene(scene: SemanticScene): Set<string> {
  const tags = new Set<string>()
  for (const concept of scene.active) concept.tags.forEach((tag) => tags.add(tag))
  return tags
}

export function applySemanticScene(
  blocks: Block[],
  scene: SemanticScene,
  graph: ConceptGraph,
): Block[] {
  return blocks.map((block) => {
    if (block.locked) return block
    if (!graph.pilotBlockTypes.has(block.type)) return block
    const assignment = scene.byType[block.type]
    if (!assignment?.text) {
      if (!block.meta.coherent) return block
      return {
        ...block,
        meta: {
          ...block.meta,
          coherent: false,
          pilotoConceptIds: undefined,
          compatibility: undefined,
        },
      }
    }
    return {
      ...block,
      value: { kind: 'custom', text: assignment.text },
      meta: {
        ...block.meta,
        coherent: true,
        pilotoConceptIds: assignment.conceptIds,
        compatibility: assignment.compatibility,
        variation: '',
      },
    }
  })
}

/** Chip / seed: fill unlocked piloto block types from one concept, leave the rest. */
export function seedUnlockedWithConcept(
  blocks: Block[],
  catalog: Catalog,
  piloto: ConceptsPiloto,
  conceptId: string,
  rng: Rng = Math.random,
): Block[] {
  const graph = indexPiloto(piloto)
  const seed = graph.byId.get(conceptId)
  if (!seed) return blocks
  const lockedIds = collectLockedConceptIds(blocks, graph)
  const lockedTags = new Set<string>()
  for (const block of blocks) {
    if (!block.locked || block.value?.kind !== 'option') continue
    findOption(catalog, block.type, block.value.optionId)?.tags.forEach((tag) => lockedTags.add(tag))
  }
  collectPilotoTags(blocks, graph).forEach((tag) => lockedTags.add(tag))
  const lockedIncompatibleTags = collectLockedIncompatibleTags(blocks, catalog)
  const compat = compatibilityCheck(seed, {
    lockedIds,
    lockedTags,
    lockedIncompatibleTags,
    graph,
  })
  if (compat === 'red') return blocks
  const active = expandConsequences([seed], graph, {
    rng,
    lockedIds,
    lockedTags,
    lockedIncompatibleTags,
    maxExtra: 6,
  })
  const compatibility = sceneCompatibility(
    active,
    lockedIds,
    lockedTags,
    lockedIncompatibleTags,
    graph,
  )
  const scene: SemanticScene = {
    seeds: [seed],
    active,
    byType: renderByType(active, compatibility),
    compatibility,
  }
  return applySemanticScene(blocks, scene, graph)
}

export async function loadConceptsPiloto(): Promise<ConceptsPiloto | null> {
  try {
    const res = await fetch('/data/concepts-piloto.json', { cache: 'no-store' })
    if (!res.ok) return null
    return normalizePiloto(await res.json())
  } catch {
    return null
  }
}
